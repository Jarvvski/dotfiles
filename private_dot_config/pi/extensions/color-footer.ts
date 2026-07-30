import {
	existsSync,
	readFileSync,
	statSync,
	watch,
	type FSWatcher,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
	ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type FooterFactory = Exclude<
	Parameters<ExtensionContext["ui"]["setFooter"]>[0],
	undefined
>;
type FooterTUI = Parameters<FooterFactory>[0];

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	latestCacheHitRate?: number;
};

type JujutsuLocation = {
	changeId: string;
	bookmarks: string;
	empty: boolean;
	description?: string;
};

const JJ_DESCRIPTION_MAX_WIDTH = 40;
const JJ_LOCATION_TEMPLATE =
	'change_id.shortest(8) ++ "\\t" ++ local_bookmarks.map(|bookmark| bookmark.name()).join(",") ++ "\\t" ++ if(empty, "true", "false") ++ "\\t" ++ description.first_line() ++ "\\n"';

function findJujutsuRepoDir(cwd: string): string | undefined {
	let directory = resolve(cwd);

	while (true) {
		const jjDirectory = join(directory, ".jj");
		if (existsSync(jjDirectory)) {
			try {
				const repoPath = join(jjDirectory, "repo");
				const repoStat = statSync(repoPath);
				if (repoStat.isDirectory()) return repoPath;
				if (repoStat.isFile()) {
					return resolve(jjDirectory, readFileSync(repoPath, "utf8").trim());
				}
			} catch {
				return undefined;
			}
		}

		const parent = resolve(directory, "..");
		if (parent === directory) return undefined;
		directory = parent;
	}
}

async function getJujutsuLocation(
	pi: ExtensionAPI,
	cwd: string,
): Promise<JujutsuLocation | undefined> {
	const result = await pi.exec(
		"jj",
		[
			"--ignore-working-copy",
			"-R",
			cwd,
			"log",
			"-r",
			"@",
			"--no-graph",
			"-T",
			JJ_LOCATION_TEMPLATE,
		],
		{ timeout: 2_000 },
	);
	if (result.code !== 0) return undefined;

	const [changeId, bookmarks = "", empty = "false", ...descriptionParts] =
		result.stdout.trimEnd().split("\t");
	if (!changeId) return undefined;

	const rawDescription = sanitizeStatus(descriptionParts.join("\t"));
	return {
		changeId,
		bookmarks,
		empty: empty === "true",
		description: rawDescription
			? truncateToWidth(rawDescription, JJ_DESCRIPTION_MAX_WIDTH, "...")
			: undefined,
	};
}

function jujutsuLocationsEqual(
	left: JujutsuLocation | undefined,
	right: JujutsuLocation | undefined,
): boolean {
	return (
		left?.changeId === right?.changeId &&
		left?.bookmarks === right?.bookmarks &&
		left?.empty === right?.empty &&
		left?.description === right?.description
	);
}

function formatTokens(count: number): string {
	if (count < 1_000) return count.toString();
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function formatCwd(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const relativeToHome = relative(resolve(home), resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." &&
			!relativeToHome.startsWith(`..${sep}`) &&
			!isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function sanitizeStatus(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function thresholdColor(
	value: number,
	goodAt: number,
	warningAt: number,
): ThemeColor {
	if (value >= goodAt) return "success";
	if (value >= warningAt) return "warning";
	return "error";
}

function contextColor(percent: number | null): ThemeColor {
	if (percent === null) return "dim";
	if (percent > 90) return "error";
	if (percent > 70) return "warning";
	return "success";
}

function collectUsage(ctx: ExtensionContext): UsageTotals {
	const totals: UsageTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant")
			continue;

		const message = entry.message as AssistantMessage;
		totals.input += message.usage.input;
		totals.output += message.usage.output;
		totals.cacheRead += message.usage.cacheRead;
		totals.cacheWrite += message.usage.cacheWrite;
		totals.cost += message.usage.cost.total;

		const promptTokens =
			message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
		totals.latestCacheHitRate =
			promptTokens > 0
				? (message.usage.cacheRead / promptTokens) * 100
				: undefined;
	}

	return totals;
}

function countPart(
	theme: Theme,
	color: ThemeColor,
	prefix: string,
	value: number,
): string | undefined {
	return value ? theme.fg(color, `${prefix}${formatTokens(value)}`) : undefined;
}

function cacheHitPart(theme: Theme, totals: UsageTotals): string | undefined {
	if (
		!(totals.cacheRead || totals.cacheWrite) ||
		totals.latestCacheHitRate === undefined
	)
		return undefined;
	return theme.fg(
		thresholdColor(totals.latestCacheHitRate, 70, 40),
		`CH${totals.latestCacheHitRate.toFixed(1)}%`,
	);
}

function costPart(theme: Theme, cost: number): string | undefined {
	return cost ? theme.fg("thinkingHigh", `$${cost.toFixed(3)}`) : undefined;
}

function contextPart(theme: Theme, ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const percent = usage ? usage.percent : 0;
	const display =
		percent === null
			? `?/${formatTokens(contextWindow)}`
			: `${percent.toFixed(1)}%/${formatTokens(contextWindow)}`;
	return theme.fg(contextColor(percent), display);
}

function renderStats(theme: Theme, ctx: ExtensionContext): string {
	const totals = collectUsage(ctx);
	const parts = [
		countPart(theme, "accent", "↑", totals.input),
		countPart(theme, "success", "↓", totals.output),
		countPart(theme, "borderAccent", "R", totals.cacheRead),
		countPart(theme, "warning", "W", totals.cacheWrite),
		cacheHitPart(theme, totals),
		costPart(theme, totals.cost),
		contextPart(theme, ctx),
	];
	return parts.filter((part): part is string => part !== undefined).join(" ");
}

function renderLocation(
	theme: Theme,
	ctx: ExtensionContext,
	footerData: ReadonlyFooterDataProvider,
	jjRepoDir: string | undefined,
	jjLocation: JujutsuLocation | undefined,
	width: number,
): string {
	let location = theme.fg(
		"borderAccent",
		formatCwd(ctx.sessionManager.getCwd()),
	);
	if (jjRepoDir) {
		if (jjLocation) {
			const identity = jjLocation.bookmarks
				? [
						theme.fg("dim", "("),
						theme.fg("accent", jjLocation.changeId),
						` ${theme.fg("success", jjLocation.bookmarks)}`,
						theme.fg("dim", ")"),
					].join("")
				: theme.fg("accent", jjLocation.changeId);
			location += ` ${identity}`;
			if (jjLocation.empty) location += ` ${theme.fg("warning", "(empty)")}`;
			location += jjLocation.description
				? ` ${theme.fg("text", jjLocation.description)}`
				: ` ${theme.fg("muted", "(no description set)")}`;
		}
	} else {
		const branch = footerData.getGitBranch();
		if (branch) location += theme.fg("dim", ` (${branch})`);
	}

	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) location += theme.fg("dim", ` • ${sessionName}`);

	return truncateToWidth(location, width, theme.fg("dim", "..."));
}

function getModelDisplay(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	footerData: ReadonlyFooterDataProvider,
	leftWidth: number,
	width: number,
): string {
	const modelName = ctx.model?.id ?? "no-model";
	const thinkingLevel = pi.getThinkingLevel();
	let display = modelName;

	if (ctx.model?.reasoning) {
		const thinkingDisplay =
			thinkingLevel === "off" ? "thinking off" : thinkingLevel;
		display = `${modelName} • ${thinkingDisplay}`;
	}

	if (ctx.model && footerData.getAvailableProviderCount() > 1) {
		const withProvider = `(${ctx.model.provider}) ${display}`;
		if (leftWidth + 2 + visibleWidth(withProvider) <= width)
			display = withProvider;
	}

	return display;
}

function alignStats(left: string, right: string, width: number): string {
	const availableForRight = width - visibleWidth(left) - 2;
	if (availableForRight <= 0) return left;

	const fittedRight = truncateToWidth(right, availableForRight, "");
	const padding = " ".repeat(
		Math.max(2, width - visibleWidth(left) - visibleWidth(fittedRight)),
	);
	return truncateToWidth(left + padding + fittedRight, width, "");
}

function renderStatsLine(
	pi: ExtensionAPI,
	theme: Theme,
	ctx: ExtensionContext,
	footerData: ReadonlyFooterDataProvider,
	width: number,
): string {
	const stats = renderStats(theme, ctx);
	const left =
		visibleWidth(stats) > width ? truncateToWidth(stats, width, "...") : stats;
	const model = getModelDisplay(pi, ctx, footerData, visibleWidth(left), width);
	return alignStats(left, theme.fg("dim", model), width);
}

function shouldRenderStatus(key: string, text: string): boolean {
	const status = sanitizeStatus(text).replace(/\x1b\[[0-9;]*m/g, "");

	if (key === "mcp") {
		const match = status.match(/^MCP:\s*(\d+)\s*\/\s*(\d+)\s+servers\b/);
		return !match || Number(match[1]) < Number(match[2]);
	}
	if (key === "pi-lens-lsp") {
		return (
			/\bLSP Failed\b/i.test(status) || !/^LSP (?:Active|On)\b/i.test(status)
		);
	}
	if (key === "safety") return !/^auto:\s*on$/i.test(status);

	return true;
}

function renderStatuses(
	theme: Theme,
	footerData: ReadonlyFooterDataProvider,
	width: number,
): string | undefined {
	const statuses = [...footerData.getExtensionStatuses().entries()]
		.filter(([key, text]) => shouldRenderStatus(key, text))
		.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
		.map(([, text]) => sanitizeStatus(text));
	return statuses.length > 0
		? truncateToWidth(statuses.join(" "), width, theme.fg("dim", "..."))
		: undefined;
}

const FOOTER_COLOR_SAMPLES: ReadonlyArray<
	readonly [element: string, color: ThemeColor]
> = [
	["Path", "borderAccent"],
	["Change ID", "accent"],
	["Bookmark", "success"],
	["Bookmark parentheses", "dim"],
	["(empty)", "warning"],
	["(no description set)", "muted"],
	["Change description", "text"],
	["Session name", "dim"],
	["Git fallback branch", "dim"],
	["Input tokens", "accent"],
	["Output tokens", "success"],
	["Cache reads", "borderAccent"],
	["Cache writes", "warning"],
	["Cost", "thinkingHigh"],
	["Model and thinking level", "dim"],
	["Healthy threshold", "success"],
	["Warning threshold", "warning"],
	["Error threshold", "error"],
	["Unknown threshold", "dim"],
];

function renderFooterColorPalette(theme: Theme, width: number): string[] {
	const lines = [theme.bold(theme.fg("accent", "Footer color palette"))];
	for (const [element, color] of FOOTER_COLOR_SAMPLES) {
		const line = `${theme.fg(color, "████")} ${element.padEnd(27)} ${theme.fg("dim", color)}`;
		lines.push(truncateToWidth(line, width, ""));
	}
	lines.push(theme.fg("dim", "Run /footer-colors again to hide"));
	return lines;
}

class ColoredFooter {
	private readonly unsubscribe: () => void;
	private jjWatcher: FSWatcher | undefined;
	private refreshTimer: ReturnType<typeof setTimeout> | undefined;
	private refreshInFlight = false;
	private refreshPending = false;
	private disposed = false;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionContext,
		private readonly tui: FooterTUI,
		private readonly theme: Theme,
		private readonly footerData: ReadonlyFooterDataProvider,
		private readonly jjRepoDir: string | undefined,
		private jjLocation: JujutsuLocation | undefined,
	) {
		this.unsubscribe = footerData.onBranchChange(() => {
			if (this.jjRepoDir) this.scheduleJujutsuRefresh();
			else this.tui.requestRender();
		});
		this.watchJujutsuOperations();
	}

	private watchJujutsuOperations(): void {
		if (!this.jjRepoDir) return;

		try {
			this.jjWatcher = watch(join(this.jjRepoDir, "op_heads", "heads"), () =>
				this.scheduleJujutsuRefresh(),
			);
			this.jjWatcher.on("error", () => {
				this.jjWatcher?.close();
				this.jjWatcher = undefined;
			});
		} catch {
			this.jjWatcher = undefined;
		}
	}

	private scheduleJujutsuRefresh(): void {
		if (this.disposed || this.refreshTimer) return;
		if (this.refreshInFlight) {
			this.refreshPending = true;
			return;
		}

		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined;
			void this.refreshJujutsuLocation();
		}, 100);
	}

	private async refreshJujutsuLocation(): Promise<void> {
		if (this.disposed || this.refreshInFlight) return;
		this.refreshInFlight = true;

		try {
			const nextLocation = await getJujutsuLocation(
				this.pi,
				this.ctx.sessionManager.getCwd(),
			);
			if (
				!this.disposed &&
				nextLocation !== undefined &&
				!jujutsuLocationsEqual(nextLocation, this.jjLocation)
			) {
				this.jjLocation = nextLocation;
				this.tui.requestRender();
			}
		} finally {
			this.refreshInFlight = false;
			if (this.refreshPending && !this.disposed) {
				this.refreshPending = false;
				this.scheduleJujutsuRefresh();
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.unsubscribe();
		this.jjWatcher?.close();
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines = [
			renderLocation(
				this.theme,
				this.ctx,
				this.footerData,
				this.jjRepoDir,
				this.jjLocation,
				width,
			),
			renderStatsLine(this.pi, this.theme, this.ctx, this.footerData, width),
		];
		const statuses = renderStatuses(this.theme, this.footerData, width);
		if (statuses) lines.push(statuses);
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	let colorsVisible = false;

	pi.registerCommand("footer-colors", {
		description: "Toggle rendered footer color samples",
		handler: (_args, ctx) => {
			colorsVisible = !colorsVisible;
			ctx.ui.setWidget(
				"footer-colors",
				colorsVisible
					? (_tui, theme) => ({
							render: (width: number) => renderFooterColorPalette(theme, width),
							invalidate() {},
						})
					: undefined,
			);
			return Promise.resolve();
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const cwd = ctx.sessionManager.getCwd();
		const jjRepoDir = findJujutsuRepoDir(cwd);
		const jjLocation = jjRepoDir
			? await getJujutsuLocation(pi, cwd)
			: undefined;
		ctx.ui.setFooter(
			(tui, theme, footerData) =>
				new ColoredFooter(
					pi,
					ctx,
					tui,
					theme,
					footerData,
					jjRepoDir,
					jjLocation,
				),
		);
	});
}
