import { completeSimple } from "@earendil-works/pi-ai/compat";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

type AutoModeConfig = {
	enabled: boolean;
	judgeModels: Record<string, string>;
	timeoutMs: number;
	maxConsecutiveDenials: number;
	maxTotalDenials: number;
};

type SafetyConfig = {
	enabled: boolean;
	autoMode: AutoModeConfig;
};
type Risk = {
	action: string;
	command?: string;
	reason: string;
	keywords: RegExp;
	capabilities: string[];
};

type SkillSafetyContract = {
	explicitInvocationGrants: string[];
	neverGrants: string[];
};

type ActiveSkillAuthorization = {
	name: string;
	grants: string[];
	neverGrants: string[];
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "safety-guard.json");
const DEFAULT_CONFIG: SafetyConfig = {
	enabled: true,
	autoMode: {
		enabled: false,
		judgeModels: {},
		timeoutMs: 6000,
		maxConsecutiveDenials: 3,
		maxTotalDenials: 20,
	},
};

type ModelIdentity = { provider: string; id: string };

type DenialState = {
	consecutive: number;
	total: number;
};

function cloneDefaultConfig(): SafetyConfig {
	return {
		enabled: DEFAULT_CONFIG.enabled,
		autoMode: {
			...DEFAULT_CONFIG.autoMode,
			judgeModels: {},
		},
	};
}

function loadConfig(): SafetyConfig {
	try {
		const parsed = JSON.parse(
			readFileSync(CONFIG_PATH, "utf8"),
		) as Partial<SafetyConfig>;
		const autoMode: Partial<AutoModeConfig> = parsed.autoMode ?? {};
		const judgeModels =
			autoMode.judgeModels && typeof autoMode.judgeModels === "object"
				? Object.fromEntries(
						Object.entries(autoMode.judgeModels).filter(
							(entry): entry is [string, string] =>
								typeof entry[0] === "string" && typeof entry[1] === "string",
						),
					)
				: {};
		return {
			enabled: parsed.enabled !== false,
			autoMode: {
				...DEFAULT_CONFIG.autoMode,
				...autoMode,
				judgeModels,
			},
		};
	} catch {
		return cloneDefaultConfig();
	}
}

function saveConfig(config: SafetyConfig): void {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function formatRisk(risk: Risk): string {
	return [
		`ACTION: ${risk.action}`,
		risk.command ? `COMMAND: \`${risk.command}\`` : undefined,
		`REASON: ${risk.reason}`,
	]
		.filter(Boolean)
		.join("\n");
}

function containsGitCommand(command: string): boolean {
	// `jj` accepts global options before its subcommand, for example
	// `jj --debug git push`. Mask those invocations before looking for direct
	// Git execution. This intentionally accepts unknown global options too:
	// Jujutsu will reject them, but they cannot cause a direct Git invocation.
	const withoutJjGit = command.replace(
		/\bjj(?:\s+(?:--[^\s;&|()`]+|-R)(?:\s+(?!-)(?:"[^"]*"|'[^']*'|[^\s;&|()`]+))?)*\s+git\b/gi,
		"jj-vcs",
	);
	return (
		/(^|[\s;&|()`])(?:[^\s;&|()`]*\/)?git(?=$|[\s;&|()`])/i.test(
			withoutJjGit,
		) || /\bgh\s+(?:repo\s+(?:clone|sync|fork)|pr\s+checkout)\b/i.test(command)
	);
}

const CAPABILITY_BY_ACTION: Record<string, string> = {
	"Create GitHub pull request": "github.pull-request.create",
	"Modify GitHub review state": "github.review.write",
	"Modify GitHub state": "github.write",
	"Create or modify a Jujutsu workspace": "vcs.workspace.write",
	"Discard or rewrite Jujutsu state": "vcs.state.discard",
	"Delete or forget a Jujutsu bookmark": "vcs.bookmark.delete",
	"Push Jujutsu changes": "vcs.push",
	"Delete files or directories": "filesystem.delete",
	"Overwrite or erase file contents": "filesystem.overwrite",
	"Apply a large edit": "filesystem.edit.large",
	"Remove system packages": "system.package.delete",
	"Change system service state": "system.service.write",
	"Run a privileged command": "system.privileged",
	"Run Terraform against infrastructure": "infrastructure.write",
	"Delete Docker resources": "docker.delete",
	"Install or change dependencies": "dependencies.write",
	"Run destructive SQL": "database.destructive",
};

function classRisk(
	action: string,
	command: string,
	reason: string,
	keywords: RegExp,
	capabilities?: string[],
): Risk {
	const capability = CAPABILITY_BY_ACTION[action];
	return {
		action,
		command,
		reason,
		keywords,
		capabilities: capabilities ?? (capability ? [capability] : []),
	};
}

function parseSkillInvocations(text: string): string[] {
	const names: string[] = [];
	const seen = new Set<string>();
	const add = (name: string, index: number, length: number): void => {
		const previous = text[index - 1];
		const next = text[index + length];
		if (
			(previous && /[a-z0-9_]/i.test(previous)) ||
			(next && /[a-z0-9_-]/i.test(next))
		)
			return;
		const normalized = name.toLowerCase();
		if (!seen.has(normalized)) {
			seen.add(normalized);
			names.push(normalized);
		}
	};

	for (const match of text.matchAll(/\/skill:([a-z0-9][a-z0-9-]*)/gi)) {
		add(match[1], match.index ?? 0, match[0].length);
	}
	for (const match of text.matchAll(/\$([a-z0-9][a-z0-9-]*)/gi)) {
		const index = match.index ?? 0;
		let backslashes = 0;
		for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--)
			backslashes++;
		if (backslashes % 2 === 1) continue;
		add(match[1], index, match[0].length);
	}
	return names;
}

function parseYamlListValue(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed) return [];
	const inline = trimmed.match(/^\[(.*)\]$/)?.[1];
	const values = inline === undefined ? [trimmed] : inline.split(",");
	return values
		.map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
		.filter(Boolean);
}

function parseSkillFrontmatterList(
	frontmatter: string,
	property: string,
): string[] {
	const lines = frontmatter.split("\n");
	const safetyIndex = lines.findIndex((line) => line.trim() === "safety:");
	if (safetyIndex < 0) return [];

	const safetyIndent = lines[safetyIndex].search(/\S|$/);
	for (let index = safetyIndex + 1; index < lines.length; index++) {
		const line = lines[index];
		const trimmed = line.trim();
		if (!trimmed) continue;
		const indent = line.search(/\S|$/);
		if (indent <= safetyIndent) break;
		if (!trimmed.startsWith(`${property}:`)) continue;

		const value = trimmed.slice(property.length + 1).trim();
		const values = parseYamlListValue(value);
		for (let next = index + 1; next < lines.length; next++) {
			const itemLine = lines[next];
			const item = itemLine.trim();
			if (!item) continue;
			const itemIndent = itemLine.search(/\S|$/);
			if (itemIndent <= indent) break;
			const listItem = item.match(/^[-*]\s+(.+)$/);
			if (listItem) values.push(...parseYamlListValue(listItem[1]));
		}
		return [...new Set(values)];
	}
	return [];
}

function readSkillSafetyContract(filePath: string): SkillSafetyContract {
	try {
		const content = readFileSync(filePath, "utf8");
		const frontmatter = content.match(
			/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/,
		)?.[1];
		if (!frontmatter) {
			return { explicitInvocationGrants: [], neverGrants: [] };
		}
		return {
			explicitInvocationGrants: parseSkillFrontmatterList(
				frontmatter,
				"explicit-invocation-grants",
			),
			neverGrants: parseSkillFrontmatterList(frontmatter, "never-grants"),
		};
	} catch {
		return { explicitInvocationGrants: [], neverGrants: [] };
	}
}

function resolveSkillAuthorizations(
	skills: Array<{ name: string; filePath: string }>,
	invocationNames: string[],
): ActiveSkillAuthorization[] {
	return invocationNames.flatMap((invocationName) => {
		const skill = skills.find(
			(candidate) => candidate.name.toLowerCase() === invocationName,
		);
		if (!skill) return [];
		const contract = readSkillSafetyContract(skill.filePath);
		return [
			{
				name: skill.name,
				grants: contract.explicitInvocationGrants,
				neverGrants: contract.neverGrants,
			},
		];
	});
}

function classifyBash(command: string): Risk | undefined {
	const normalized = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();

	if (
		/\bgh\s+(?:api|pr|issue|project|release|repo|workflow)\b/i.test(
			normalized,
		) &&
		(/\bmutation\b/i.test(normalized) ||
			/\b(?:-X|--method)\s+(?:POST|PUT|PATCH|DELETE)\b/i.test(normalized) ||
			/\bgh\s+(?:pr|issue|project|release|repo|workflow)\s+(?:comment|close|create|delete|edit|merge|reopen|review|run|update|enable|disable)\b/i.test(
				normalized,
			))
	) {
		const isPullRequestCreation = /\bgh\s+pr\s+create\b/i.test(normalized);
		const isReviewMutation =
			!isPullRequestCreation &&
			/\b(?:review|comment|comments|thread|threads|resolve|resolved|dismiss)\b/i.test(
				normalized,
			);
		let action: string;
		let keywords: RegExp;
		if (isPullRequestCreation) {
			action = "Create GitHub pull request";
			keywords = /\b(create|make|open|submit|raise|file|pull request|pr)\b/i;
		} else if (isReviewMutation) {
			action = "Modify GitHub review state";
			keywords =
				/\b(resolve|resolved|dismiss|reply|respond|address|comment|comments|review|thread|threads)\b/i;
		} else {
			action = "Modify GitHub state";
			keywords =
				/\b(github|gh|pull request|pr|issue|project|release|repo|workflow|create|delete|edit|merge|update)\b/i;
		}
		return classRisk(
			action,
			command,
			"This command may modify external GitHub state using repository credentials.",
			keywords,
			/\bgh\s+pr\s+merge\b/i.test(normalized)
				? ["github.pull-request.merge"]
				: undefined,
		);
	}

	if (
		/\bjj\s+workspace\s+(add|forget|rename|update-stale)\b/i.test(normalized)
	) {
		return classRisk(
			"Create or modify a Jujutsu workspace",
			command,
			"Additional workspaces are allowed only when the user explicitly asks.",
			/\b(workspace|worktree)\b/i,
		);
	}
	if (
		/\bjj\s+(abandon|restore)\b|\bjj\s+op\s+(restore|undo)\b/i.test(normalized)
	) {
		return classRisk(
			"Discard or rewrite Jujutsu state",
			command,
			"This can replace or abandon current repository state.",
			/\b(abandon|restore|undo|discard)\b/i,
		);
	}
	if (/\bjj\s+bookmark\s+(delete|forget)\b/i.test(normalized)) {
		return classRisk(
			"Delete or forget a Jujutsu bookmark",
			command,
			"This removes a local or tracked reference.",
			/\b(delete|forget|remove)\b/i,
		);
	}
	if (/\bjj\s+git\s+push\b/i.test(normalized)) {
		return classRisk(
			"Push Jujutsu changes",
			command,
			"This changes remote repository state.",
			/\b(push|publish|land)\b/i,
		);
	}
	if (
		/\brm\b[\s\S]*(-r|-R|-f|--recursive|--force)\b|\bfind\b[\s\S]*\s-delete\b/i.test(
			normalized,
		)
	) {
		return classRisk(
			"Delete files or directories",
			command,
			"The command removes filesystem data.",
			/\b(delete|remove|erase|wipe|purge)\b/i,
		);
	}
	const overwriteScan = normalized.replace(
		/(?:\d*|&)?>>?\s*(?:"\/dev\/null"|'\/dev\/null'|\/dev\/null)(?=$|[\s;&|)])/g,
		"",
	);
	if (
		/\b(truncate|shred)\b/i.test(normalized) ||
		/(^|[^<])>\s*[^&\s]/i.test(overwriteScan)
	) {
		return classRisk(
			"Overwrite or erase file contents",
			command,
			"The command may replace existing file contents.",
			/\b(overwrite|replace|truncate|erase|write)\b/i,
		);
	}
	if (
		/\b(sudo\s+)?(apt|apt-get|dnf|yum|pacman|brew)\s+(remove|purge|uninstall|autoremove)\b/i.test(
			normalized,
		)
	) {
		return classRisk(
			"Remove system packages",
			command,
			"Package removal changes the host system.",
			/\b(remove|purge|uninstall)\b/i,
		);
	}
	if (
		/\b(sudo\s+)?(systemctl|service)\s+(stop|disable|restart)\b/i.test(
			normalized,
		)
	) {
		return classRisk(
			"Change system service state",
			command,
			"Service changes can disrupt running processes.",
			/\b(stop|disable|restart|service)\b/i,
		);
	}
	if (/\bsudo\b/i.test(normalized)) {
		return classRisk(
			"Run a privileged command",
			command,
			"Privileged commands can modify system-level state.",
			/\b(sudo|privileged|system)\b/i,
		);
	}
	if (/\bterraform\s+(plan|apply|destroy)\b/i.test(normalized)) {
		return classRisk(
			"Run Terraform against infrastructure",
			command,
			"Terraform operations may inspect or modify live infrastructure.",
			/\b(terraform|infrastructure|plan|apply|destroy)\b/i,
		);
	}
	if (
		/\bdocker\s+(system\s+prune|container\s+(rm|prune)|volume\s+(rm|prune)|image\s+(rm|prune)|rm\b)/i.test(
			normalized,
		)
	) {
		return classRisk(
			"Delete Docker resources",
			command,
			"This can remove containers, images, volumes, or cached data.",
			/\b(docker|container|image|volume|prune|remove)\b/i,
		);
	}
	if (
		/\b(bun\s+(install|add|remove|update)|uv\s+(sync|add|remove)|npm\s+(install|uninstall|update|ci)|pip\s+(install|uninstall))\b/i.test(
			normalized,
		)
	) {
		return classRisk(
			"Install or change dependencies",
			command,
			"Dependency changes require an explicit user request.",
			/\b(dependenc|install|add|remove|update|sync)\b/i,
		);
	}
	if (
		/\b(drop\s+(table|database|schema)|truncate\s+table|delete\s+from)\b/i.test(
			normalized,
		)
	) {
		return classRisk(
			"Run destructive SQL",
			command,
			"The SQL can permanently remove data or schema objects.",
			/\b(sql|drop|truncate|delete|database|table|schema)\b/i,
		);
	}
	return undefined;
}

function classifyFileTool(
	toolName: string,
	input: Record<string, unknown>,
	inJjRepo: boolean,
): Risk | undefined {
	let path: string | undefined;
	if (typeof input.path === "string") path = input.path;
	else if (typeof input.filePath === "string") path = input.filePath;
	if (!path) return undefined;
	if (/(^|\/)\.env($|\.)|(^|\/)(\.git|\.jj|node_modules)(\/|$)/.test(path)) {
		return {
			action: `Modify protected path ${path}`,
			reason:
				"Protected paths may contain secrets, VCS internals, or dependency artifacts.",
			keywords:
				/\b(modify|edit|write|replace|environment|secret|dependency|vcs)\b/i,
			capabilities: [],
		};
	}
	if (inJjRepo) return undefined;
	if (toolName === "write" && existsSync(path)) {
		return {
			action: `Overwrite existing file ${path}`,
			reason:
				"This existing file is outside a detected Jujutsu recovery boundary.",
			keywords: /\b(overwrite|replace|write|modify)\b/i,
			capabilities: ["filesystem.overwrite"],
		};
	}
	if (
		toolName === "edit" &&
		(Array.isArray(input.edits) ? input.edits.length : 1) >= 3
	) {
		return {
			action: `Apply a large edit to ${path}`,
			reason:
				"Large edits outside a detected Jujutsu repository are harder to recover.",
			keywords: /\b(edit|modify|replace|refactor)\b/i,
			capabilities: ["filesystem.edit.large"],
		};
	}
	return undefined;
}

function lastUserText(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getBranch();
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index] as any;
		const message = entry.type === "message" ? entry.message : undefined;
		if (message?.role !== "user") continue;
		if (typeof message.content === "string") return message.content;
		if (Array.isArray(message.content)) {
			return message.content
				.map((part: any) => (part?.type === "text" ? (part.text ?? "") : ""))
				.join("\n")
				.trim();
		}
	}
	return "";
}

function currentAuthorizationTexts(ctx: ExtensionContext): string[] {
	const branch = ctx.sessionManager.getBranch();
	let latestUserIndex = -1;
	let latestUserText = "";
	for (let index = branch.length - 1; index >= 0; index--) {
		const entry = branch[index] as any;
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		latestUserIndex = index;
		latestUserText = textContent(entry.message.content);
		break;
	}

	const texts = latestUserText ? [latestUserText] : [];
	for (let index = latestUserIndex + 1; index < branch.length; index++) {
		const entry = branch[index] as any;
		if (
			entry.type === "message" &&
			entry.message?.role === "toolResult" &&
			entry.message.toolName === "questionnaire" &&
			entry.message.isError !== true
		) {
			const text = textContent(entry.message.content);
			if (text) texts.push(text);
		}
	}
	return texts;
}

function explicitlyRequestedInCurrentTurn(
	ctx: ExtensionContext,
	risk: Risk,
): boolean {
	return currentAuthorizationTexts(ctx).some((text) =>
		explicitlyRequested(text, risk),
	);
}

function skillAuthorizesRisk(
	skills: ActiveSkillAuthorization[],
	risk: Risk,
): boolean {
	if (skills.length === 0 || risk.capabilities.length === 0) return false;
	return risk.capabilities.some(
		(capability) =>
			!skills.some((skill) => skill.neverGrants.includes(capability)) &&
			skills.some((skill) => skill.grants.includes(capability)),
	);
}

function explicitlyRequested(userText: string, risk: Risk): boolean {
	const text = userText.toLowerCase();
	if (!text || !risk.keywords.test(text)) return false;
	if (
		risk.action === "Modify GitHub review state" &&
		!/\b(resolve|resolved|dismiss|reply|respond|address|comment|comments|review|thread|threads)\b/i.test(
			text,
		)
	)
		return false;
	if (risk.action === "Create GitHub pull request") {
		const hasCreateAction =
			/\b(create|make|open|submit|raise|file|making)\b/i.test(text);
		const hasPullRequestTarget = /\b(pull request|pr)\b/i.test(text);
		if (!hasCreateAction || !hasPullRequestTarget) return false;
	}
	if (
		risk.action === "Modify GitHub state" &&
		!/\b(create|make|delete|edit|merge|close|reopen|run|update|enable|disable)\b/i.test(
			text,
		)
	)
		return false;
	if (
		/\b(do not|don't|never|avoid|without)\b.{0,40}\b(delete|remove|overwrite|replace|push|install|workspace|worktree|terraform|docker|drop|truncate)\b/i.test(
			text,
		)
	)
		return false;
	if (
		risk.command &&
		normalizeCommand(text).includes(
			normalizeCommand(risk.command.toLowerCase()),
		)
	)
		return true;
	return true;
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part: any) => (part?.type === "text" ? (part.text ?? "") : ""))
		.join("\n")
		.trim();
}

function normalizeCommand(command: string): string {
	return command.replace(/\s+/g, " ").trim();
}

function bashCommandFromToolCall(part: unknown): string | undefined {
	if (!part || typeof part !== "object") return undefined;
	const toolCall = part as { name?: unknown; arguments?: unknown };
	if (toolCall.name !== "bash") return undefined;
	if (
		toolCall.arguments &&
		typeof toolCall.arguments === "object" &&
		typeof (toolCall.arguments as { command?: unknown }).command === "string"
	)
		return (toolCall.arguments as { command: string }).command;
	if (typeof toolCall.arguments !== "string") return undefined;
	try {
		const parsed = JSON.parse(toolCall.arguments) as { command?: unknown };
		return typeof parsed.command === "string" ? parsed.command : undefined;
	} catch {
		return undefined;
	}
}

function isRetryRequest(userText: string): boolean {
	return /\b(try (?:again|now)|retry|do it|run it|go ahead|proceed|yes|please do|i want you to do it)\b/i.test(
		userText.trim(),
	);
}

/**
 * Accept a terse retry only when it can be traced through identical earlier bash
 * calls to a user message that explicitly authorized this exact risky command.
 * This deliberately does not authorize a changed bookmark, remote, or command.
 */
function explicitlyAuthorizedRetry(
	ctx: ExtensionContext,
	currentCommand: string,
	risk: Risk,
): boolean {
	const branch = ctx.sessionManager.getBranch();
	const normalizedCurrent = normalizeCommand(currentCommand);
	const latestUserText = lastUserText(ctx);
	if (!isRetryRequest(latestUserText)) return false;

	// A user can make an exact request and subsequently use a terse retry. Scan
	// the active branch for that exact original authorization before relying on
	// assistant tool-call serialization, which is not stable across reloads.
	for (const entry of branch) {
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		if (explicitlyRequested(textContent(entry.message.content), risk))
			return true;
	}

	let skipCurrentToolCall = true;
	for (let index = branch.length - 1; index >= 0; index--) {
		const entry = branch[index] as any;
		if (entry.type !== "message" || entry.message?.role !== "assistant")
			continue;
		const parts = entry.message.content;
		if (!Array.isArray(parts)) continue;

		for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
			const previousCommand = bashCommandFromToolCall(parts[partIndex]);
			if (
				!previousCommand ||
				normalizeCommand(previousCommand) !== normalizedCurrent
			)
				continue;
			if (skipCurrentToolCall) {
				skipCurrentToolCall = false;
				continue;
			}

			for (let userIndex = index - 1; userIndex >= 0; userIndex--) {
				const userEntry = branch[userIndex] as any;
				if (userEntry.type !== "message" || userEntry.message?.role !== "user")
					continue;
				const userText = textContent(userEntry.message.content);
				if (explicitlyRequested(userText, risk)) return true;
				if (isRetryRequest(userText)) break;
				return false;
			}
		}
	}
	return false;
}

async function isInsideJjRepo(pi: ExtensionAPI): Promise<boolean> {
	try {
		return (await pi.exec("jj", ["root"])).code === 0;
	} catch {
		return false;
	}
}

function requestsPackageWorktree(input: Record<string, unknown>): boolean {
	const visit = (value: unknown): boolean => {
		if (!value || typeof value !== "object") return false;
		if (Array.isArray(value)) return value.some(visit);
		for (const [key, child] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (key === "worktree" && child === true) return true;
			if (visit(child)) return true;
		}
		return false;
	};
	return visit(input);
}

function classifyMcpMutation(input: Record<string, unknown>): Risk | undefined {
	const tool = typeof input.tool === "string" ? input.tool : "";
	if (
		!tool ||
		!/(create|update|delete|remove|send|post|write|save|comment|resolve|archive|invite|assign|link|unlink)/i.test(
			tool,
		)
	)
		return undefined;
	return {
		action: `Call mutating MCP tool ${tool}`,
		reason: "The call may modify external service state.",
		keywords:
			/\b(create|update|delete|remove|send|post|write|save|comment|resolve|archive|invite|assign|link|external|linear|slack|notion|grafana)\b/i,
		capabilities: ["external-service.write"],
	};
}

async function confirmRisk(
	risk: Risk,
	ctx: ExtensionContext,
): Promise<boolean> {
	if (!ctx.hasUI) return false;
	return (
		(await ctx.ui.select(`${formatRisk(risk)}\n\nAllow this action?`, [
			"Allow once",
			"Block",
		])) === "Allow once"
	);
}

function modelIdentity(model: ModelIdentity | undefined): string | undefined {
	return model ? `${model.provider}/${model.id}` : undefined;
}

function globMatches(pattern: string, value: string): boolean {
	let patternIndex = 0;
	let valueIndex = 0;
	let starIndex = -1;
	let starValueIndex = -1;

	while (valueIndex < value.length) {
		const patternCharacter = pattern[patternIndex];
		if (patternCharacter === value[valueIndex] || patternCharacter === "?") {
			patternIndex++;
			valueIndex++;
		} else if (patternCharacter === "*") {
			starIndex = patternIndex++;
			starValueIndex = valueIndex;
		} else if (starIndex >= 0) {
			patternIndex = starIndex + 1;
			valueIndex = ++starValueIndex;
		} else {
			return false;
		}
	}

	while (pattern[patternIndex] === "*") patternIndex++;
	return patternIndex === pattern.length;
}

function resolveJudgeModel(
	model: ModelIdentity | undefined,
	mappings: Record<string, string>,
): string | undefined {
	const key = modelIdentity(model);
	if (!key) return undefined;

	const exact = mappings[key];
	if (exact) return exact;

	let bestMatch: { target: string; specificity: number } | undefined;
	for (const [pattern, target] of Object.entries(mappings)) {
		if (!pattern.includes("*") && !pattern.includes("?")) continue;
		if (!globMatches(pattern, key)) continue;
		const specificity = [...pattern].filter(
			(character) => character !== "*" && character !== "?",
		).length;
		if (!bestMatch || specificity > bestMatch.specificity) {
			bestMatch = { target, specificity };
		}
	}
	return bestMatch?.target;
}

function splitModelReference(
	reference: string,
): { provider: string; id: string } | undefined {
	const separator = reference.indexOf("/");
	if (separator <= 0 || separator === reference.length - 1) return undefined;
	return {
		provider: reference.slice(0, separator),
		id: reference.slice(separator + 1),
	};
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part: unknown) => {
			if (
				!part ||
				typeof part !== "object" ||
				(part as { type?: unknown }).type !== "text"
			)
				return [];
			return [(part as { text?: unknown }).text ?? ""];
		})
		.join("\n")
		.trim();
}

function stringifyValue(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

type JudgeToolCall = {
	toolName: string;
	input: Record<string, unknown>;
};

function buildJudgeTranscript(
	ctx: ExtensionContext,
	toolCall: JudgeToolCall,
	risk: Risk,
	skillAuthorizations: ActiveSkillAuthorization[],
): string {
	const lines: string[] = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message") continue;
		const message = entry.message as {
			role?: string;
			content?: unknown;
			toolName?: string;
			isError?: boolean;
		};
		if (message.role === "user") {
			const text = contentText(message.content);
			if (text) lines.push(`USER: ${text}`);
			continue;
		}
		if (
			message.role === "toolResult" &&
			message.toolName === "questionnaire" &&
			message.isError !== true
		) {
			const text = contentText(message.content);
			if (text) lines.push(`QUESTIONNAIRE ANSWER: ${text}`);
			continue;
		}
		if (message.role !== "assistant" || !Array.isArray(message.content))
			continue;
		for (const part of message.content) {
			if (
				!part ||
				typeof part !== "object" ||
				(part as { type?: unknown }).type !== "toolCall"
			)
				continue;
			const toolCall = part as { name?: unknown; arguments?: unknown };
			lines.push(
				`TOOL CALL: ${String(toolCall.name ?? "unknown")} ${stringifyValue(toolCall.arguments)}`,
			);
		}
	}

	lines.push(
		`CURRENT TOOL CALL: ${toolCall.toolName} ${stringifyValue(toolCall.input)}`,
	);
	lines.push(
		`LOCAL RISK PREFILTER: ${risk.action}. ${risk.reason}`,
		`RISK CAPABILITIES: ${risk.capabilities.join(", ") || "none"}`,
	);
	for (const skillAuthorization of skillAuthorizations) {
		lines.push(
			`EXPLICIT SKILL INVOCATION: ${skillAuthorization.name}`,
			`SKILL AUTHORIZED CAPABILITIES: ${skillAuthorization.grants.join(", ") || "none"}`,
			`SKILL NEVER-GRANTED CAPABILITIES: ${skillAuthorization.neverGrants.join(", ") || "none"}`,
		);
	}
	if (
		toolCall.toolName === "bash" &&
		typeof toolCall.input.command === "string" &&
		explicitlyAuthorizedRetry(ctx, toolCall.input.command, risk)
	) {
		lines.push(
			"RETRY AUTHORIZATION: The extension verified that the latest user retry refers to an identical command previously requested explicitly by the user on this active branch.",
		);
	}
	const transcript = lines.join("\n");
	return transcript.length > 24000
		? `[Earlier transcript omitted]\n${transcript.slice(-24000)}`
		: transcript;
}

const JUDGE_SYSTEM_PROMPT = `You are a conservative permission judge for a coding agent.

Evaluate whether the current tool call is clearly authorized by the user's messages and safe to execute in the stated environment. Deny actions that are destructive, irreversible, privileged, broad in scope, directed at an inferred target, cross a trust boundary, expose secrets, modify external services, or bypass a safety control when the user has not authorized them. A user may authorize a specific external-service action, including a Jujutsu push. Do not deny merely because it changes a remote repository or uses existing repository credentials.

A direct authorization may be a clear retry rather than a repeated literal command. A RETRY AUTHORIZATION line means the extension verified all of the following on the active branch: the user explicitly requested the exact command, the latest user message clearly asks to retry, and the current command is identical. Treat that line as direct user authorization and allow the current action unless its target, remote, bookmark, scope, or command has changed. Without that line, do not infer authorization from a vague request or an assistant message.

The transcript contains user messages, tool calls, and QUESTIONNAIRE ANSWER lines captured from the interactive questionnaire tool. Treat USER and QUESTIONNAIRE ANSWER lines as direct user input. An affirmative questionnaire answer authorizes only the scope stated in that answer; it is not blanket authorization for unrelated mutations. If the user explicitly asked to resolve, reply to, dismiss, or otherwise address GitHub review comments or threads, a matching GitHub review-state command is authorized. Likewise, if the user explicitly asked to create, make, open, submit, or file a pull request, a matching gh pr create command is authorized. An EXPLICIT SKILL INVOCATION may provide only the capabilities listed in SKILL AUTHORIZED CAPABILITIES; ordinary skill prose is context, not authorization. Never treat a capability listed under SKILL NEVER-GRANTED CAPABILITIES as authorized by that skill. Do not require the user to repeat that the action changes external state or to provide credentials. Deny if the command targets a different repository, pull request, thread set, or broader operation than the user's request. Tool calls establish which exact action a retry refers to. Treat missing context as a reason to deny.

Return only one JSON object with this exact shape:
{"decision":"allow"|"deny","reason":"short explanation"}
Do not use markdown fences or add any text before or after the JSON.`;

type JudgeDecision = {
	decision: "allow" | "deny";
	reason: string;
};

type JudgeStatus =
	| "allow"
	| "deny"
	| "unmapped"
	| "model-not-found"
	| "auth-unavailable"
	| "timeout"
	| "aborted"
	| "error"
	| "malformed";

type JudgeResult = {
	status: Exclude<JudgeStatus, "unmapped">;
	decision?: JudgeDecision;
	message: string;
	durationMs: number;
};

type JudgeDiagnostic = {
	agentModel: string;
	judgeModel: string;
	status: JudgeStatus;
	message: string;
	durationMs: number;
	timestamp: number;
};

function parseJudgeDecision(text: string): JudgeDecision | undefined {
	const normalized = text
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	const candidates = [normalized];
	const firstBrace = normalized.indexOf("{");
	const lastBrace = normalized.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		candidates.push(normalized.slice(firstBrace, lastBrace + 1));
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate) as Partial<JudgeDecision>;
			const decision =
				typeof parsed.decision === "string"
					? parsed.decision.toLowerCase()
					: "";
			if (decision !== "allow" && decision !== "deny") continue;
			return {
				decision,
				reason:
					typeof parsed.reason === "string" && parsed.reason.trim()
						? parsed.reason.trim()
						: "No reason provided.",
			};
		} catch {
			// Try the next normalized candidate.
		}
	}
	return undefined;
}

async function askJudge(
	ctx: ExtensionContext,
	judgeReference: string,
	toolCall: JudgeToolCall,
	risk: Risk,
	timeoutMs: number,
	skillAuthorizations: ActiveSkillAuthorization[],
): Promise<JudgeResult> {
	const startedAt = Date.now();
	const result = (
		status: JudgeResult["status"],
		message: string,
		decision?: JudgeDecision,
	): JudgeResult => ({
		status,
		message,
		decision,
		durationMs: Date.now() - startedAt,
	});

	const reference = splitModelReference(judgeReference);
	if (!reference) return result("error", "Invalid judge model reference.");

	let model: ReturnType<ExtensionContext["modelRegistry"]["find"]>;
	try {
		model = ctx.modelRegistry.find(reference.provider, reference.id);
	} catch {
		return result("model-not-found", "Judge model lookup failed.");
	}
	if (!model)
		return result("model-not-found", "Judge model is not registered.");

	let auth: Awaited<
		ReturnType<ExtensionContext["modelRegistry"]["getApiKeyAndHeaders"]>
	>;
	try {
		auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	} catch {
		return result(
			"auth-unavailable",
			"Judge model authentication lookup failed.",
		);
	}
	if (!auth.ok || !auth.apiKey) {
		return result(
			"auth-unavailable",
			"No usable credentials were found for the judge model.",
		);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
	const abortCurrentRequest = () => controller.abort();
	if (ctx.signal) {
		if (ctx.signal.aborted) controller.abort();
		else
			ctx.signal.addEventListener("abort", abortCurrentRequest, { once: true });
	}

	try {
		const response = await completeSimple(
			model,
			{
				systemPrompt: JUDGE_SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: buildJudgeTranscript(
									ctx,
									toolCall,
									risk,
									skillAuthorizations,
								),
							},
						],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
				signal: controller.signal,
				reasoning: "minimal",
				maxTokens: 1024,
				maxRetries: 0,
			},
		);
		if (controller.signal.aborted) {
			return result(
				ctx.signal?.aborted ? "aborted" : "timeout",
				ctx.signal?.aborted
					? "Judge request was aborted."
					: `Judge request exceeded ${timeoutMs}ms.`,
			);
		}
		const responseContent = response.content as Array<{
			type: string;
			text?: string;
		}>;
		const text = responseContent
			.flatMap((part) =>
				part.type === "text" && typeof part.text === "string"
					? [part.text]
					: [],
			)
			.join("\n");
		const decision = parseJudgeDecision(text);
		if (!decision) {
			const blockTypes =
				responseContent.map((part) => part.type).join(",") || "none";
			const preview = text.replace(/\s+/g, " ").trim().slice(0, 200);
			return result(
				"malformed",
				`Judge returned invalid output. Blocks: ${blockTypes}; text chars: ${text.length}; preview: ${JSON.stringify(preview)}`,
			);
		}
		return result(decision.decision, decision.reason, decision);
	} catch (error) {
		if (controller.signal.aborted) {
			return result(
				ctx.signal?.aborted ? "aborted" : "timeout",
				ctx.signal?.aborted
					? "Judge request was aborted."
					: `Judge request exceeded ${timeoutMs}ms.`,
			);
		}
		const message =
			error instanceof Error ? error.message : "Unknown judge provider error.";
		return result("error", message.slice(0, 240));
	} finally {
		clearTimeout(timeout);
		ctx.signal?.removeEventListener("abort", abortCurrentRequest);
	}
}

function autoStatus(
	config: SafetyConfig,
	model: ModelIdentity | undefined,
): string {
	if (!config.enabled || !config.autoMode.enabled) return "auto:off";
	if (!modelIdentity(model)) return "auto:off";
	return resolveJudgeModel(model, config.autoMode.judgeModels)
		? "auto:on"
		: "auto:off";
}

export default function safetyGuard(pi: ExtensionAPI) {
	let config = loadConfig();
	const denialStates = new Map<string, DenialState>();
	let lastJudgeDiagnostic: JudgeDiagnostic | undefined;
	let pendingSkillInvocationNames: string[] = [];
	let activeSkillAuthorizations: ActiveSkillAuthorization[] = [];

	const recordJudgeDiagnostic = (
		agentModel: ModelIdentity | undefined,
		judgeModel: string,
		result:
			| JudgeResult
			| { status: "unmapped"; message: string; durationMs?: number },
	): void => {
		lastJudgeDiagnostic = {
			agentModel: modelIdentity(agentModel) ?? "unknown",
			judgeModel,
			status: result.status,
			message: result.message,
			durationMs: result.durationMs ?? 0,
			timestamp: Date.now(),
		};
	};

	const formatJudgeDiagnostic = (): string => {
		if (!lastJudgeDiagnostic)
			return "No judge request has been attempted in this session.";
		const diagnostic = lastJudgeDiagnostic;
		return [
			`Status: ${diagnostic.status}`,
			`Agent model: ${diagnostic.agentModel}`,
			`Judge model: ${diagnostic.judgeModel}`,
			`Duration: ${diagnostic.durationMs}ms`,
			`Message: ${diagnostic.message}`,
		].join("\n");
	};

	const setEnabled = (enabled: boolean): void => {
		config = { ...config, enabled };
		saveConfig(config);
	};

	const setAutoEnabled = (enabled: boolean): void => {
		config = { ...config, autoMode: { ...config.autoMode, enabled } };
		saveConfig(config);
	};

	const updateAutoStatus = (
		ctx: ExtensionContext,
		model: ModelIdentity | undefined = ctx.model,
	): void => {
		if (ctx.hasUI) ctx.ui.setStatus("safety", autoStatus(config, model));
	};

	const resetConsecutiveDenials = (model: ModelIdentity | undefined): void => {
		const key = modelIdentity(model);
		if (!key) return;
		const state = denialStates.get(key);
		if (state) state.consecutive = 0;
	};

	const recordDenial = (model: ModelIdentity | undefined): DenialState => {
		const key = modelIdentity(model) ?? "unknown";
		const state = denialStates.get(key) ?? { consecutive: 0, total: 0 };
		state.consecutive++;
		state.total++;
		denialStates.set(key, state);
		return state;
	};

	const reachedDenialThreshold = (state: DenialState): boolean =>
		state.consecutive >= Math.max(1, config.autoMode.maxConsecutiveDenials) ||
		state.total >= Math.max(1, config.autoMode.maxTotalDenials);

	const statusMessage = (ctx: ExtensionContext): string => {
		const mappings = Object.entries(config.autoMode.judgeModels);
		const mappingText =
			mappings.length > 0
				? mappings.map(([agent, judge]) => `- ${agent} -> ${judge}`).join("\n")
				: "(no judge mappings configured)";
		return `${autoStatus(config, ctx.model)}\n\nMappings:\n${mappingText}`;
	};

	pi.registerCommand("safety", {
		description: "Manage Safety Guard: /safety enable|disable|status",
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (command === "enable" || command === "disable") {
				setEnabled(command === "enable");
				ctx.ui.notify(
					`Safety Guard ${config.enabled ? "enabled" : "disabled"}`,
					config.enabled ? "info" : "warning",
				);
				updateAutoStatus(ctx);
				return;
			}
			if (command === "" || command === "status") {
				ctx.ui.notify(
					`Safety Guard is ${config.enabled ? "enabled" : "disabled"}\n${autoStatus(config, ctx.model)}`,
					config.enabled ? "info" : "warning",
				);
				return;
			}
			ctx.ui.notify(
				"Usage: /safety enable | /safety disable | /safety status",
				"warning",
			);
		},
	});

	pi.registerCommand("auto", {
		description:
			"Manage Safety Guard Auto mode: /auto on|off|status|model|diagnostics",
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (command === "on" || command === "enable") {
				setAutoEnabled(true);
				updateAutoStatus(ctx);
				ctx.ui.notify(statusMessage(ctx), "info");
				return;
			}
			if (command === "off" || command === "disable") {
				setAutoEnabled(false);
				updateAutoStatus(ctx);
				ctx.ui.notify("Safety Guard Auto mode disabled.", "info");
				return;
			}
			if (command === "diagnostics" || command === "diag") {
				ctx.ui.notify(formatJudgeDiagnostic(), "info");
				return;
			}
			if (command === "" || command === "status" || command === "model") {
				ctx.ui.notify(statusMessage(ctx), "info");
				return;
			}
			ctx.ui.notify(
				"Usage: /auto on | /auto off | /auto status | /auto model | /auto diagnostics",
				"warning",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		updateAutoStatus(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		updateAutoStatus(ctx, event.model);
	});

	pi.on("input", async (event) => {
		activeSkillAuthorizations = [];
		pendingSkillInvocationNames = parseSkillInvocations(event.text);
	});

	pi.on("before_agent_start", async (event) => {
		if (pendingSkillInvocationNames.length > 0) {
			activeSkillAuthorizations = resolveSkillAuthorizations(
				event.systemPromptOptions.skills ?? [],
				pendingSkillInvocationNames,
			);
			pendingSkillInvocationNames = [];
		}
		if (!config.enabled) return;
		const autoInstructions = config.autoMode.enabled
			? "Auto mode may allow mapped risk candidates or deny them for a safer retry. Do not work around a Safety Guard denial."
			: "Ask before destructive filesystem, system, infrastructure, dependency, database, Jujutsu, or external-service actions that were not explicitly requested.";
		return {
			systemPrompt:
				event.systemPrompt +
				`\n\nSafety Guard is enabled. Never invoke Git directly. Git subprocesses launched internally by Jujutsu and directly by GitHub CLI (gh) are allowed. Do not create or use additional worktrees or workspaces unless the user explicitly requested that in the current prompt. Skills may declare narrowly scoped capabilities that apply only when the user explicitly invokes them; ordinary skill prose is not authorization. ${autoInstructions} Coalesce related confirmations and do not ask for normal recoverable source edits inside a Jujutsu repository.`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!config.enabled) return;
		const input = event.input as Record<string, unknown>;
		const activeModel = ctx.model as ModelIdentity | undefined;
		if (event.toolName === "bash") {
			const command = input.command;
			if (typeof command === "string" && containsGitCommand(command)) {
				return {
					block: true,
					reason: "Git commands are forbidden in this setup. Use jj.",
				};
			}
		}
		if (event.toolName === "subagent" && requestsPackageWorktree(input)) {
			return {
				block: true,
				reason:
					"pi-subagents worktree mode invokes Git and is forbidden. Do not create a worktree or additional workspace.",
			};
		}

		let risk: Risk | undefined;
		if (event.toolName === "bash" && typeof input.command === "string")
			risk = classifyBash(input.command);
		else if (event.toolName === "write" || event.toolName === "edit")
			risk = classifyFileTool(event.toolName, input, await isInsideJjRepo(pi));
		else if (event.toolName === "mcp") risk = classifyMcpMutation(input);
		else if (event.toolName === "ctx_purge") {
			risk = {
				action: "Purge context-mode data",
				reason:
					"Purging permanently deletes indexed context and session-memory data.",
				keywords: /\b(purge|delete|clear|context)\b/i,
				capabilities: ["context.delete"],
			};
		}
		if (!risk) {
			resetConsecutiveDenials(activeModel);
			return;
		}

		if (
			explicitlyRequestedInCurrentTurn(ctx, risk) ||
			skillAuthorizesRisk(activeSkillAuthorizations, risk)
		) {
			resetConsecutiveDenials(activeModel);
			return;
		}
		const judgeReference = config.autoMode.enabled
			? resolveJudgeModel(activeModel, config.autoMode.judgeModels)
			: undefined;
		if (judgeReference) {
			const judgeResult = await askJudge(
				ctx,
				judgeReference,
				{ toolName: event.toolName, input },
				risk,
				config.autoMode.timeoutMs,
				activeSkillAuthorizations,
			);
			recordJudgeDiagnostic(activeModel, judgeReference, judgeResult);
			if (judgeResult.decision?.decision === "allow") {
				resetConsecutiveDenials(activeModel);
				return;
			}
			if (judgeResult.decision?.decision === "deny") {
				const state = recordDenial(activeModel);
				const reason = `Safety Guard Auto mode judge denied this action: ${judgeResult.decision.reason}`;
				if (!reachedDenialThreshold(state)) return { block: true, reason };
				if (await confirmRisk(risk, ctx)) {
					resetConsecutiveDenials(activeModel);
					return;
				}
				return {
					block: true,
					reason: `${reason}\nRepeated denials reached the escalation threshold.`,
				};
			}
		} else if (config.autoMode.enabled) {
			recordJudgeDiagnostic(activeModel, "(none)", {
				status: "unmapped",
				message: "No judge mapping matched the active agent model.",
			});
		}

		if (await confirmRisk(risk, ctx)) {
			resetConsecutiveDenials(activeModel);
			return;
		}
		return {
			block: true,
			reason: `Safety Guard blocked action.\n${formatRisk(risk)}`,
		};
	});
}
