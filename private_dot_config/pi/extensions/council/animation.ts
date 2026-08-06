import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	readCouncilDebateStatements,
	readCouncilFleet,
	readCouncilRunPulse,
	type CouncilFleet,
	type CouncilRunPulse,
} from "./fleet.ts";
import {
	COUNCIL_MEMBERS,
	loadDebateTranscript,
	loadProgress,
	strictMajority,
	writeDebateStatements,
	type CouncilDebateStatement,
	type CouncilProgress,
	type CouncilProgressPhase,
	type CouncilSeatActivity,
	type CouncilSeatState,
} from "./protocol.ts";

const WIDGET_KEY = "council-chamber";
const FRAME_INTERVAL_MS = 120;
const PROGRESS_INTERVAL_MS = 500;
const STALE_AFTER_MS = 15_000;
const PULSE_STALE_AFTER_MS = 45_000;
const FINALE_MS = 900;

export interface CouncilVisualState {
	/** Central seal glyph, also used by the compact layout. */
	seal: string;
	/** Three centered chamber lines: upper rays, seal row, lower rays. */
	lines: [string, string, string];
	color: "accent" | "success" | "warning" | "error";
}

type ChamberFrame = [string, string, string];

const CHAMBER: Record<
	CouncilProgressPhase,
	{ color: CouncilVisualState["color"]; frames: ChamberFrame[] }
> = {
	starting: {
		color: "accent",
		frames: [
			["·     ·     ·", "    [ · ]    ", "·     ·     ·"],
			["╲     ·     ╱", "    [ • ]    ", "╱     ·     ╲"],
			["╲     │     ╱", "  ─ [ ● ] ─  ", "╱     │     ╲"],
			["╲     │     ╱", "─── [ ◉ ] ───", "╱     │     ╲"],
		],
	},
	"member-research": {
		color: "accent",
		frames: [
			["╲     │     ╱", "<──── [ ◌ ] ────>", "╱     │     ╲"],
			["╲     │     ╱", " <─── [ ◍ ] ───> ", "╱     │     ╲"],
			["╲     │     ╱", "  <── [ ◎ ] ──>  ", "╱     │     ╲"],
			["╲     │     ╱", " <─── [ ◉ ] ───> ", "╱     │     ╲"],
		],
	},
	proposals: {
		color: "accent",
		frames: [
			["·     │     ·", "◇ ──→ [ ◇ ] ←── ◇", "·     │     ·"],
			["·     │     ·", " ◇ ─→ [ ◇ ] ←─ ◇ ", "·     │     ·"],
			["·     │     ·", "  ◇ → [ ◈ ] ← ◇  ", "·     │     ·"],
			["·     │     ·", "   ◇  [ ◈ ]  ◇   ", "·     │     ·"],
		],
	},
	alignment: {
		color: "warning",
		frames: [
			["╲     │     ╱", "╞═╪═══╡ [ ◈ ] ╞═══╪═╡", "╱     │     ╲"],
			["╲     │     ╱", "╞══╪══╡ [ ◈ ] ╞══╪══╡", "╱     │     ╲"],
			["╲     │     ╱", "╞═══╪═╡ [ ◈ ] ╞═╪═══╡", "╱     │     ╲"],
			["╲     │     ╱", "╞══╪══╡ [ ◈ ] ╞══╪══╡", "╱     │     ╲"],
		],
	},
	voting: {
		color: "warning",
		frames: [
			["╲     │     ╱", "YES ──→ [ Y ] ←── NO", "╱     │     ╲"],
			["╲     │     ╱", "YES ─── [ ◉ ] ─── NO", "╱     │     ╲"],
			["╲     │     ╱", "YES ──→ [ N ] ←── NO", "╱     │     ╲"],
			["╲     │     ╱", "YES ─── [ ◉ ] ─── NO", "╱     │     ╲"],
		],
	},
	reconciliation: {
		color: "warning",
		frames: [
			["╲  ╳  │  ╳  ╱", "─── [ ◈ ] ───", "╱  ╳  │  ╳  ╲"],
			["╱  ╳  │  ╳  ╲", "─── [ ◇ ] ───", "╲  ╳  │  ╳  ╱"],
			["╲  ·  │  ·  ╱", "─── [ ◈ ] ───", "╱  ·  │  ·  ╲"],
		],
	},
	publishing: {
		color: "accent",
		frames: [
			["╔═══════════╗", "║   [ ◉ ]   ║", "╚═══════════╝"],
			["╔═══════════╗", "║   [ ◎ ]   ║", "╚═══════════╝"],
			["╔═══════════╗", "║   [ ● ]   ║", "╚═══════════╝"],
			["╔═══════════╗", "║   [ ⊙ ]   ║", "╚═══════════╝"],
		],
	},
	complete: {
		color: "success",
		frames: [["╔═══════════╗", "║  [ OK ]   ║", "╚═══════════╝"]],
	},
	failed: {
		color: "error",
		frames: [["╲  ╳     ╳  ╱", "╌╌╌ [ X ] ╌╌╌", "╱  ╳     ╳  ╲"]],
	},
};

function sealGlyph(sealRow: string): string {
	return /\[[^\]]*\]/.exec(sealRow)?.[0] ?? "[ · ]";
}

export function councilPhaseLabel(phase: CouncilProgressPhase): string {
	return phase
		.replace("member-research", "research")
		.replace("-", " ")
		.toUpperCase();
}

export function councilVisualState(
	phase: CouncilProgressPhase,
	frame: number,
): CouncilVisualState {
	const chamber = CHAMBER[phase];
	const step = Math.floor(Math.max(0, frame) / 2);
	const lines = chamber.frames[step % chamber.frames.length] as ChamberFrame;
	return { seal: sealGlyph(lines[1]), lines, color: chamber.color };
}

function elapsedLabel(startedAt: number, now: number): string {
	const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function fit(text: string, width: number): string {
	return truncateToWidth(text, Math.max(1, width), "");
}

function frameLine(content: string, width: number, center = false): string {
	const innerWidth = Math.max(1, width - 2);
	const clipped = fit(content, innerWidth);
	const pad = Math.max(0, innerWidth - visibleWidth(clipped));
	const leftPad = center ? Math.floor(pad / 2) : 0;
	return `│${" ".repeat(leftPad)}${clipped}${" ".repeat(pad - leftPad)}│`;
}

function titleBorder(title: string, plainTitle: string, width: number): string {
	const innerWidth = Math.max(1, width - 2);
	const filler = Math.max(0, innerWidth - visibleWidth(plainTitle) - 1);
	return `╭─${fit(title, innerWidth - 1)}${"─".repeat(filler)}╮`;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type SeatColor = "success" | "accent" | "warning" | "error" | "muted";

function seatVisual(
	activity: CouncilSeatActivity,
	frame: number,
): { glyph: string; tag: string; color: SeatColor } {
	const spin = SPINNER[Math.floor(frame / 2) % SPINNER.length] as string;
	switch (activity) {
		case "seated":
			return { glyph: "○", tag: "", color: "muted" };
		case "briefing":
			return { glyph: "◌", tag: "brief", color: "muted" };
		case "researching":
			return { glyph: spin, tag: "rsch", color: "accent" };
		case "research-complete":
			return { glyph: "◍", tag: "evid", color: "accent" };
		case "drafting":
			return { glyph: spin, tag: "draft", color: "accent" };
		case "proposed":
			return { glyph: "◆", tag: "prop", color: "accent" };
		case "aligning":
			return { glyph: "◎", tag: "align", color: "warning" };
		case "ready":
			return { glyph: "●", tag: "ready", color: "success" };
		case "voted-yes":
			return { glyph: "⊕", tag: "YES", color: "success" };
		case "voted-no":
			return { glyph: "⊖", tag: "NO", color: "error" };
		case "reconciling":
			return { glyph: "╳", tag: "recon", color: "warning" };
		case "replaced":
			return { glyph: "⊗", tag: "repl", color: "warning" };
		case "stalled":
			return {
				glyph: frame % 4 < 2 ? "◌" : "○",
				tag: "wait",
				color: "warning",
			};
		case "failed":
			return { glyph: "⊠", tag: "fail", color: "error" };
	}
}

function inferredActivity(
	progress: CouncilProgress,
	index: number,
	seatCount: number,
	frame: number,
): CouncilSeatActivity {
	const completed = Math.min(seatCount, Math.max(0, progress.completed ?? 0));
	if (progress.phase === "failed")
		return index < completed ? "ready" : "failed";
	if (progress.phase === "complete" || progress.phase === "publishing")
		return "ready";
	if (index < completed) return "ready";
	const active =
		completed < seatCount
			? completed
			: Math.floor(frame / 4) % Math.max(1, seatCount);
	if (index !== active) return "seated";
	switch (progress.phase) {
		case "member-research":
			return "researching";
		case "proposals":
			return "drafting";
		case "alignment":
			return "aligning";
		case "voting":
			return "aligning";
		case "reconciliation":
			return "reconciling";
		default:
			return "briefing";
	}
}

function fleetSeatState(
	fleet: CouncilFleet,
	progress: CouncilProgress,
	index: number,
): CouncilSeatState | undefined {
	const seat = fleet.seats[index];
	if (!seat) return undefined;
	const memberId = `C${index + 1}`;
	if (seat.status === "failed" || seat.status === "timeout")
		return { memberId, activity: "failed" };
	const done = seat.status === "complete" || seat.status === "completed";
	if (fleet.agent === "council-member") {
		if (done) return { memberId, activity: "research-complete" };
		return {
			memberId,
			activity: "researching",
			researchersPending: Math.max(
				0,
				(seat.researchersTotal || 2) - seat.researchersComplete,
			),
		};
	}
	if (done) return { memberId, activity: "ready" };
	return {
		memberId,
		activity: progress.phase === "reconciliation" ? "reconciling" : "aligning",
	};
}

function memberName(memberId: string): string {
	return (
		COUNCIL_MEMBERS.find((member) => member.id === memberId)?.name ?? memberId
	);
}

function proposalOwner(proposalId: string): string | undefined {
	const match = /^P-(C[1-7])$/i.exec(proposalId);
	return match?.[1]?.toUpperCase();
}

function proposalReference(proposalId: string, memberId?: string): string {
	const owner = proposalOwner(proposalId);
	if (!owner) return proposalId;
	if (owner === memberId) return "own";
	return memberName(owner);
}

function seatTag(
	seat: CouncilSeatState | undefined,
	activity: CouncilSeatActivity,
	pending: string | undefined,
	fallback: string,
): string {
	const detail = seat?.detail;
	if (detail) {
		const allVotes = /^all\s+(\d+)$/i.exec(detail)?.[1];
		if (allVotes && activity === "voted-yes")
			return `approved all ${allVotes} proposals`;
		if (allVotes && activity === "voted-no")
			return `rejected all ${allVotes} proposals`;
		const proposal = proposalReference(detail, seat.memberId);
		switch (activity) {
			case "aligning":
			case "ready":
			case "reconciling":
				return `backs ${proposal}`;
			case "proposed":
				return proposal === "own" ? "proposed" : `proposal ${proposal}`;
			case "voted-yes":
				return `YES ${proposal}`;
			case "voted-no":
				return `NO ${proposal}`;
			default:
				return detail;
		}
	}
	return pending ?? fallback;
}

function fleetIsCurrent(
	fleet: CouncilFleet | undefined,
	progress: CouncilProgress,
): fleet is CouncilFleet {
	return !!fleet && fleet.updatedAt >= progress.updatedAt;
}

function seatMarkers(
	progress: CouncilProgress,
	seatCount: number,
	frame: number,
	theme: Theme,
	fleet?: CouncilFleet,
): string[] {
	const useFleet = fleetIsCurrent(fleet, progress);
	const reported = new Map<string, CouncilSeatState>(
		(progress.seats ?? []).map((seat) => [seat.memberId, seat]),
	);
	return Array.from({ length: seatCount }, (_, index) => {
		const memberId = `C${index + 1}`;
		const reportedSeat = reported.get(memberId);
		const fleetSeat = useFleet
			? fleetSeatState(fleet, progress, index)
			: undefined;
		const seat = fleetSeat
			? { ...reportedSeat, ...fleetSeat, detail: reportedSeat?.detail }
			: reportedSeat;
		const activity =
			seat?.activity ?? inferredActivity(progress, index, seatCount, frame);
		const visual = seatVisual(activity, frame);
		const pending =
			activity === "researching" && seat?.researchersPending !== undefined
				? `${seat.researchersPending}/2 research`
				: undefined;
		const tag = seatTag(seat, activity, pending, visual.tag);
		const name = memberName(memberId);
		const label = tag ? `${name} · ${tag}` : name;
		return `${theme.fg(visual.color, visual.glyph)} ${theme.fg(visual.color === "muted" ? "muted" : "text", label)}`;
	});
}

function focusLine(
	progress: CouncilProgress,
	seatCount: number,
	theme: Theme,
): string | undefined {
	const focus = progress.focus;
	if (!focus) return undefined;
	const tally =
		focus.yes !== undefined || focus.no !== undefined
			? `  ${theme.fg("success", `YES ${focus.yes ?? 0}`)} ${theme.fg("muted", "|")} ${theme.fg("error", `NO ${focus.no ?? 0}`)} ${theme.fg("dim", `(needs ${strictMajority(seatCount)})`)}`
			: "";
	const title = focus.title ? ` "${focus.title}"` : "";
	const proposal = proposalOwner(focus.proposalId)
		? `${proposalReference(focus.proposalId)} proposal`
		: focus.proposalId;
	return ` ${theme.fg("accent", `FLOOR ${proposal}`)}${title}${tally}`;
}

function fleetLine(fleet: CouncilFleet, theme: Theme): string {
	const label = fleet.agent === "council-member" ? "SEATS" : "PARTICIPANTS";
	const seatPart = `${label} ${fleet.complete}/${fleet.seats.length} complete, ${fleet.running} running`;
	const researchPart = fleet.researchersTotal
		? `  ${theme.fg("muted", "|")}  RESEARCHERS ${fleet.researchersComplete}/${fleet.researchersTotal} complete, ${fleet.researchersRunning} running`
		: "";
	const failedPart = fleet.failed
		? `  ${theme.fg("muted", "|")}  ${theme.fg("error", `${fleet.failed} failed`)}`
		: "";
	const costPart =
		fleet.costUsd !== undefined
			? `  ${theme.fg("muted", "|")}  $${fleet.costUsd.toFixed(2)}`
			: "";
	return ` ${theme.fg("accent", seatPart)}${researchPart}${failedPart}${costPart}`;
}

function argumentTickerLine(
	progress: CouncilProgress,
	statements: CouncilDebateStatement[] | undefined,
	frame: number,
	theme: Theme,
): string | undefined {
	if (!statements?.length) return undefined;
	const latestPhase = [
		"reconciliation",
		"voting",
		"alignment-debate",
		"alignment",
	].find((phase) => statements.some((statement) => statement.phase === phase));
	const visible = statements.filter((statement) => {
		if (progress.phase === "alignment")
			return (
				statement.phase === "alignment" ||
				statement.phase === "alignment-debate"
			);
		if (progress.phase === "publishing" || progress.phase === "complete")
			return statement.phase === latestPhase;
		return statement.phase === progress.phase;
	});
	if (visible.length === 0) return undefined;
	const index = Math.floor(frame / 32) % visible.length;
	const statement = visible[index];
	if (!statement) return undefined;
	const labels: Record<CouncilDebateStatement["kind"], string> = {
		argument: "ARGUES",
		challenge: "CHALLENGES",
		response: "REPLIES",
		vote: "VOTE",
		dissent: "DISSENTS",
	};
	const target = statement.targetMemberId
		? ` → ${memberName(statement.targetMemberId)}`
		: "";
	let proposal = "";
	if (statement.proposalId) {
		const reference = proposalOwner(statement.proposalId)
			? `${proposalReference(statement.proposalId, statement.memberId)} proposal`
			: statement.proposalId;
		proposal = ` on ${reference}`;
	}
	const action =
		statement.kind === "vote" && statement.vote
			? statement.vote
			: labels[statement.kind];
	return ` ${theme.fg("warning", `DEBATE ${index + 1}/${visible.length}`)} ${theme.fg("muted", "·")} ${theme.fg("accent", statement.memberName)}${target} ${theme.fg("dim", `${action}${proposal}`)}: ${statement.text}`;
}

function heartbeatLine(
	progress: CouncilProgress,
	fleet: CouncilFleet | undefined,
	pulse: CouncilRunPulse | undefined,
	frame: number,
	now: number,
	theme: Theme,
): string | undefined {
	if (progress.status !== "RUNNING") return undefined;
	const currentFleet = fleetIsCurrent(fleet, progress) ? fleet : undefined;
	const signalAt = Math.max(
		progress.updatedAt,
		currentFleet?.updatedAt ?? 0,
		pulse?.updatedAt ?? 0,
	);
	const ageSeconds = Math.max(0, Math.floor((now - signalAt) / 1000));
	const staleAfter = pulse ? PULSE_STALE_AFTER_MS : STALE_AFTER_MS;
	const live = now - signalAt <= staleAfter;
	const glyph = live
		? (SPINNER[Math.floor(frame / 2) % SPINNER.length] as string)
		: "◌";
	let activity = "chairman working";
	if (currentFleet?.running) {
		const label =
			currentFleet.agent === "council-member" ? "members" : "participants";
		activity = `${currentFleet.complete}/${currentFleet.seats.length} ${label} complete, ${currentFleet.running} working`;
	} else if (
		currentFleet &&
		currentFleet.seats.length > 0 &&
		currentFleet.complete + currentFleet.failed === currentFleet.seats.length
	) {
		const label =
			currentFleet.agent === "council-member" ? "member" : "participant";
		activity = `chairman processing completed ${label} fanout`;
	}
	const state = live ? "LIVE" : "WAITING";
	const color = live ? "success" : "warning";
	return ` ${theme.fg(color, `${glyph} ${state}`)} ${theme.fg("muted", "·")} ${activity} ${theme.fg("dim", `· signal ${ageSeconds}s ago`)}`;
}

export function renderCouncilChamber(
	progress: CouncilProgress,
	seatCount: number,
	frame: number,
	startedAt: number,
	now: number,
	width: number,
	theme: Theme,
	fleet?: CouncilFleet,
	pulse?: CouncilRunPulse,
	statements?: CouncilDebateStatement[],
): string[] {
	const visual = councilVisualState(progress.phase, frame);
	const currentFleet = fleetIsCurrent(fleet, progress) ? fleet : undefined;
	const liveAt = Math.max(
		progress.updatedAt,
		currentFleet?.updatedAt ?? 0,
		pulse?.updatedAt ?? 0,
	);
	const staleAfter = pulse ? PULSE_STALE_AFTER_MS : STALE_AFTER_MS;
	const stale = progress.status === "RUNNING" && now - liveAt > staleAfter;
	const phaseLabel = councilPhaseLabel(progress.phase);
	const phase = theme.fg(visual.color, phaseLabel);
	const inFlight =
		progress.status === "RUNNING" &&
		!stale &&
		!!currentFleet &&
		currentFleet.running > 0;
	const message = stale
		? theme.fg("warning", "WAITING FOR A RUNTIME SIGNAL")
		: inFlight
			? `${progress.message} ${theme.fg("dim", `(${currentFleet.agent} fanout in flight)`)}`
			: progress.message;
	const completed = currentFleet?.complete ?? progress.completed;
	const total = currentFleet?.seats.length ?? progress.total;
	const count =
		completed !== undefined && total !== undefined
			? `${completed}/${total}`
			: `-/${seatCount}`;
	const signalAge = Math.max(0, Math.floor((now - liveAt) / 1000));
	const meta = `${count} seats  |  elapsed ${elapsedLabel(startedAt, now)}  |  signal ${signalAge}s ago`;
	if (width < 64) {
		const compactProposal = progress.focus
			? proposalOwner(progress.focus.proposalId)
				? `${proposalReference(progress.focus.proposalId)} proposal`
				: progress.focus.proposalId
			: undefined;
		const floorTag = progress.focus
			? ` :: ${compactProposal} ${progress.focus.yes ?? 0}Y/${progress.focus.no ?? 0}N`
			: "";
		return [
			fit(
				`${theme.fg(visual.color, visual.seal)} COUNCIL :: ${phase} :: ${count}${floorTag}`,
				width,
			),
			fit(`${message}  |  ${meta}`, width),
		];
	}
	const markers = seatMarkers(progress, seatCount, frame, theme, currentFleet);
	const floor = focusLine(progress, seatCount, theme);
	const ticker = argumentTickerLine(progress, statements, frame, theme);
	const heartbeat = heartbeatLine(
		progress,
		currentFleet,
		pulse,
		frame,
		now,
		theme,
	);
	const topCount = Math.ceil(seatCount / 2);
	const topRow = markers.slice(0, topCount).join("      ");
	const bottomRow = [
		...markers.slice(topCount),
		`${theme.fg(visual.color, "◆")} CHAIR`,
	].join("      ");
	const plainTitle = ` COUNCIL CHAMBER :: ${phaseLabel} `;
	return [
		titleBorder(` COUNCIL CHAMBER :: ${phase} `, plainTitle, width),
		frameLine(topRow, width, true),
		...visual.lines.map((line) =>
			frameLine(theme.fg(visual.color, line), width, true),
		),
		frameLine(bottomRow, width, true),
		frameLine(` ${message}`, width),
		...(heartbeat ? [frameLine(heartbeat, width)] : []),
		...(ticker ? [frameLine(ticker, width)] : []),
		...(currentFleet ? [frameLine(fleetLine(currentFleet, theme), width)] : []),
		...(floor ? [frameLine(floor, width)] : []),
		frameLine(` ${theme.fg("dim", meta)}`, width),
		`╰${"─".repeat(Math.max(1, width - 2))}╯`,
	];
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CouncilChamberAnimation {
	private readonly ctx: ExtensionContext;
	private readonly runId: string;
	private readonly seatCount: number;
	private readonly startedAt: number;
	private progress: CouncilProgress;
	private frame = 0;
	private frameTimer: ReturnType<typeof setInterval> | undefined;
	private progressTimer: ReturnType<typeof setInterval> | undefined;
	private tui: { requestRender(): void } | undefined;
	private active = false;
	private widgetActive = false;
	private disposed = false;
	private chairmanRunId: string | undefined;
	private fleet: CouncilFleet | undefined;
	private pulse: CouncilRunPulse | undefined;
	private statements: CouncilDebateStatement[];

	constructor(
		ctx: ExtensionContext,
		runId: string,
		seatCount: number,
		startedAt = Date.now(),
	) {
		this.ctx = ctx;
		this.runId = runId;
		this.seatCount = seatCount;
		this.startedAt = startedAt;
		this.statements = loadDebateTranscript(runId)?.statements ?? [];
		this.progress = loadProgress(runId) ?? {
			version: 1,
			runId,
			updatedAt: startedAt,
			phase: "starting",
			message: "Chamber is assembling.",
			total: seatCount,
			status: "RUNNING",
		};
	}

	start(): void {
		if (this.active) return;
		this.active = true;
		if (this.ctx.hasUI && this.ctx.mode === "tui") {
			this.widgetActive = true;
			this.ctx.ui.setWidget(
				WIDGET_KEY,
				(tui, theme) => {
					this.tui = tui;
					return {
						render: (width) =>
							renderCouncilChamber(
								this.progress,
								this.seatCount,
								this.frame,
								this.startedAt,
								Date.now(),
								width,
								theme,
								this.fleet,
								this.pulse,
								this.statements,
							),
						invalidate: () => undefined,
					};
				},
				{ placement: "aboveEditor" },
			);
			this.frameTimer = setInterval(() => {
				if (this.disposed) return;
				this.frame += 1;
				this.tui?.requestRender();
			}, FRAME_INTERVAL_MS);
		}
		this.progressTimer = setInterval(
			() => this.refresh(),
			PROGRESS_INTERVAL_MS,
		);
	}

	/** Attach the chairman's async run so nested seat and researcher activity becomes visible. */
	setChairmanRunId(chairmanRunId: string | undefined): void {
		this.chairmanRunId = chairmanRunId;
		this.refresh();
	}

	private captureDebate(): void {
		if (!this.chairmanRunId) return;
		const live = readCouncilDebateStatements(this.chairmanRunId);
		const known = new Set(this.statements.map((statement) => statement.id));
		if (!live.some((statement) => !known.has(statement.id))) return;
		this.statements = writeDebateStatements(this.runId, live).statements;
	}

	private refresh(): void {
		if (this.disposed) return;
		const next = loadProgress(this.runId);
		if (next) this.progress = next;
		if (this.chairmanRunId) {
			try {
				this.fleet = readCouncilFleet(this.chairmanRunId) ?? this.fleet;
				this.pulse = readCouncilRunPulse(this.chairmanRunId) ?? this.pulse;
				this.captureDebate();
			} catch {
				// Live runtime data is advisory; the chairman breadcrumbs remain authoritative.
			}
		}
		this.tui?.requestRender();
	}

	async finish(success: boolean, message?: string): Promise<void> {
		if (!this.active || this.disposed) return;
		try {
			this.captureDebate();
		} catch {
			// A final transcript refresh is best effort and must not block completion.
		}
		this.progress = {
			...this.progress,
			phase: success ? "complete" : "failed",
			status: success ? "COMPLETE" : "FAILED",
			message:
				message ??
				(success
					? "The council seal is closed."
					: "The chamber fell silent before publication."),
			updatedAt: Date.now(),
		};
		this.tui?.requestRender();
		await sleep(FINALE_MS);
		this.dispose();
	}

	dispose(): void {
		this.release(true);
	}

	private release(clearWidget: boolean): void {
		if (this.disposed) return;
		this.disposed = true;
		if (this.frameTimer) clearInterval(this.frameTimer);
		if (this.progressTimer) clearInterval(this.progressTimer);
		this.frameTimer = undefined;
		this.progressTimer = undefined;
		const shouldClearWidget = clearWidget && this.widgetActive;
		this.active = false;
		this.widgetActive = false;
		if (shouldClearWidget) this.ctx.ui.setWidget(WIDGET_KEY, undefined);
	}
}
