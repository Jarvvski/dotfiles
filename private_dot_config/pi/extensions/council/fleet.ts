import * as filesystem from "node:fs";
import * as os from "node:os";
import * as pathing from "node:path";
import type { CouncilDebatePhase, CouncilDebateStatement } from "./protocol.ts";

const MAX_REGISTRIES_SCANNED = 8;

export interface CouncilSeatRun {
	index: number;
	status: string;
	researchersComplete: number;
	researchersTotal: number;
}

export interface CouncilFleet {
	updatedAt: number;
	/** Agent used by the chairman's current fanout, such as council-member. */
	agent: string;
	seats: CouncilSeatRun[];
	running: number;
	complete: number;
	failed: number;
	researchersRunning: number;
	researchersComplete: number;
	researchersTotal: number;
	costUsd?: number;
}

export interface CouncilRunPulse {
	updatedAt: number;
	state: string;
	activity?: string;
}

interface AsyncRunStatus {
	state?: string;
	lastActivityAt?: number;
	lastUpdate?: number;
	startedAt?: number;
	steps?: Array<{ activityState?: string; status?: string }>;
}

interface RegistryStep {
	status?: string;
	sessionFile?: string;
}

interface RegistryChild {
	id?: string;
	parentRunId?: string;
	parentStepIndex?: number;
	agent?: string;
	state?: string;
	startedAt?: number;
	lastUpdate?: number;
	steps?: RegistryStep[];
	children?: RegistryChild[];
	totalCost?: { costUsd?: number };
}

interface Registry {
	updatedAt?: number;
	children?: RegistryChild[];
}

function subagentStateRoot(): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : 0;
	return pathing.join(os.tmpdir(), `pi-subagents-uid-${uid}`);
}

export function nestedEventsRoot(): string {
	return pathing.join(subagentStateRoot(), "nested-subagent-events");
}

export function asyncRunsRoot(): string {
	return pathing.join(subagentStateRoot(), "async-subagent-runs");
}

export function readCouncilRunPulse(
	chairmanRunId: string,
	root = asyncRunsRoot(),
): CouncilRunPulse | undefined {
	try {
		const status = JSON.parse(
			filesystem.readFileSync(
				pathing.join(root, chairmanRunId, "status.json"),
				"utf8",
			),
		) as AsyncRunStatus;
		const updatedAt = Math.max(
			status.lastActivityAt ?? 0,
			status.lastUpdate ?? 0,
			status.startedAt ?? 0,
		);
		if (updatedAt <= 0) return undefined;
		const step = status.steps?.[0];
		return {
			updatedAt,
			state: String(status.state ?? step?.status ?? "running"),
			...(step?.activityState ? { activity: step.activityState } : undefined),
		};
	} catch {
		return undefined;
	}
}

const registryPaths = new Map<string, string>();
const statementCache = new Map<
	string,
	{ modifiedAt: number; size: number; statements: CouncilDebateStatement[] }
>();

function readRegistry(file: string): Registry | undefined {
	try {
		return JSON.parse(filesystem.readFileSync(file, "utf8")) as Registry;
	} catch {
		return undefined;
	}
}

function registryMatches(registry: Registry, chairmanRunId: string): boolean {
	return (registry.children ?? []).some(
		(child) => child.parentRunId === chairmanRunId,
	);
}

function findRegistryPath(
	chairmanRunId: string,
	root: string,
): string | undefined {
	const cached = registryPaths.get(chairmanRunId);
	if (cached && filesystem.existsSync(cached)) return cached;
	let entries: filesystem.Dirent[];
	try {
		entries = filesystem.readdirSync(root, { withFileTypes: true });
	} catch {
		return undefined;
	}
	const candidates = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const file = pathing.join(root, entry.name, "registry.json");
			let modifiedAt = 0;
			try {
				modifiedAt = filesystem.statSync(file).mtimeMs;
			} catch {
				return undefined;
			}
			return { file, modifiedAt };
		})
		.filter((entry): entry is { file: string; modifiedAt: number } => !!entry)
		.sort((left, right) => right.modifiedAt - left.modifiedAt)
		.slice(0, MAX_REGISTRIES_SCANNED);
	for (const candidate of candidates) {
		const registry = readRegistry(candidate.file);
		if (registry && registryMatches(registry, chairmanRunId)) {
			registryPaths.set(chairmanRunId, candidate.file);
			return candidate.file;
		}
	}
	return undefined;
}

function firstJsonObject(text: string): Record<string, unknown> | undefined {
	const start = text.indexOf("{");
	if (start < 0) return undefined;
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (quoted) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') quoted = false;
			continue;
		}
		if (char === '"') quoted = true;
		else if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				try {
					const value = JSON.parse(text.slice(start, index + 1)) as unknown;
					return value && typeof value === "object"
						? (value as Record<string, unknown>)
						: undefined;
				} catch {
					return undefined;
				}
			}
		}
	}
	return undefined;
}

interface SessionEntry {
	type?: string;
	message?: {
		role?: string;
		content?: Array<{ type?: string; text?: string }>;
	};
}

function parseSessionEntry(line: string): SessionEntry | undefined {
	try {
		return JSON.parse(line) as SessionEntry;
	} catch {
		return undefined;
	}
}

function finalAssistantPayload(
	sessionFile: string,
): Record<string, unknown> | undefined {
	let raw: string;
	try {
		raw = filesystem.readFileSync(sessionFile, "utf8");
	} catch {
		return undefined;
	}
	const lines = raw.trimEnd().split("\n");
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const entry = parseSessionEntry(lines[index] ?? "");
		if (entry?.type !== "message" || entry.message?.role !== "assistant")
			continue;
		const text = (entry.message.content ?? [])
			.flatMap((part) =>
				part.type === "text" && typeof part.text === "string"
					? [part.text]
					: [],
			)
			.join("\n");
		return firstJsonObject(text);
	}
	return undefined;
}

function debatePhase(
	payload: Record<string, unknown>,
): CouncilDebatePhase | undefined {
	if (
		payload.phase === "alignment" ||
		payload.phase === "alignment-debate" ||
		payload.phase === "voting" ||
		payload.phase === "reconciliation"
	)
		return payload.phase;
	if (Array.isArray(payload.ballots)) return "voting";
	if (payload.sponsors || payload.readinessStatement) return "alignment";
	return undefined;
}

function cleanStatement(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.replace(/\s+/g, " ").trim();
	return text ? text.slice(0, 800) : undefined;
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
	return Array.isArray(value)
		? value.filter(
				(entry): entry is Record<string, unknown> =>
					Boolean(entry) && typeof entry === "object",
			)
		: [];
}

function statementsFromPayload(
	payload: Record<string, unknown>,
	prefix: string,
	recordedAt: number,
): CouncilDebateStatement[] {
	const phase = debatePhase(payload);
	const memberId = String(payload.memberId ?? "").toUpperCase();
	if (!phase || !/^C[1-7]$/.test(memberId)) return [];
	const memberName = String(payload.name ?? memberId).slice(0, 40);
	const statements: CouncilDebateStatement[] = [];
	const add = (
		kind: CouncilDebateStatement["kind"],
		text: unknown,
		index: number,
		extra: Pick<
			CouncilDebateStatement,
			"proposalId" | "targetMemberId" | "vote"
		> = {},
	) => {
		const clean = cleanStatement(text);
		if (!clean) return;
		statements.push({
			id: `${prefix}:${kind}:${index}`,
			phase,
			memberId,
			memberName,
			kind,
			text: clean,
			recordedAt,
			...extra,
		});
	};
	add("argument", payload.publicArgument ?? payload.readinessStatement, 0);
	objectArray(payload.challenges ?? payload.conflicts).forEach(
		(challenge, index) =>
			add("challenge", challenge.text ?? challenge.reason, index, {
				...(challenge.proposalId || challenge.a
					? { proposalId: String(challenge.proposalId ?? challenge.a) }
					: undefined),
				...(challenge.targetMemberId
					? { targetMemberId: String(challenge.targetMemberId) }
					: undefined),
			}),
	);
	objectArray(
		payload.responses ?? payload.directResponses ?? payload.rebuttals,
	).forEach((response, index) =>
		add(
			"response",
			response.text ??
				response.response ??
				response.rebuttal ??
				response.rationale,
			index,
			{
				...(response.proposalId
					? { proposalId: String(response.proposalId) }
					: undefined),
				...(response.targetMemberId
					? { targetMemberId: String(response.targetMemberId) }
					: undefined),
			},
		),
	);
	objectArray(payload.ballots ?? payload.votes).forEach((ballot, index) =>
		add("vote", ballot.rationale, index, {
			...(ballot.proposalId
				? { proposalId: String(ballot.proposalId) }
				: undefined),
			...(ballot.vote === "YES" || ballot.vote === "NO"
				? { vote: ballot.vote }
				: undefined),
		}),
	);
	add("dissent", payload.recordedDissent ?? payload.dissent, 0);
	return statements;
}

function statementsFromSession(
	sessionFile: string,
	prefix: string,
): CouncilDebateStatement[] {
	try {
		const stat = filesystem.statSync(sessionFile);
		const cached = statementCache.get(sessionFile);
		if (
			cached &&
			cached.modifiedAt === stat.mtimeMs &&
			cached.size === stat.size
		)
			return cached.statements;
		const payload = finalAssistantPayload(sessionFile);
		const statements = payload
			? statementsFromPayload(payload, prefix, stat.mtimeMs)
			: [];
		statementCache.set(sessionFile, {
			modifiedAt: stat.mtimeMs,
			size: stat.size,
			statements,
		});
		return statements;
	} catch {
		return [];
	}
}

export function readCouncilDebateStatements(
	chairmanRunId: string,
	root = nestedEventsRoot(),
): CouncilDebateStatement[] {
	const file = findRegistryPath(chairmanRunId, root);
	if (!file) return [];
	const registry = readRegistry(file);
	if (!registry) return [];
	return (registry.children ?? [])
		.filter(
			(child) =>
				child.parentRunId === chairmanRunId &&
				child.agent === "council-participant",
		)
		.flatMap((fanout) =>
			(fanout.steps ?? []).flatMap((step, index) =>
				isComplete(String(step.status ?? "")) && step.sessionFile
					? statementsFromSession(
							step.sessionFile,
							`${fanout.id ?? fanout.startedAt ?? "fanout"}:${index}`,
						)
					: [],
			),
		)
		.sort(
			(left, right) =>
				left.recordedAt - right.recordedAt || left.id.localeCompare(right.id),
		);
}

function countStatus(
	steps: RegistryStep[],
	match: (status: string) => boolean,
) {
	return steps.filter((step) => match(String(step.status ?? ""))).length;
}

function isComplete(status: string): boolean {
	return status === "complete" || status === "completed";
}

function isFailed(status: string): boolean {
	return status === "failed" || status === "error" || status === "timeout";
}

function researcherRuns(
	registry: Registry,
	fanout: RegistryChild,
): RegistryChild[] {
	const nested = [
		...(fanout.children ?? []),
		...(registry.children ?? []).filter(
			(child) => child.parentRunId && child.parentRunId === fanout.id,
		),
	];
	const seen = new Set<RegistryChild>();
	return nested.filter((child) => {
		if (seen.has(child)) return false;
		seen.add(child);
		return true;
	});
}

export function readCouncilFleet(
	chairmanRunId: string,
	root = nestedEventsRoot(),
): CouncilFleet | undefined {
	const file = findRegistryPath(chairmanRunId, root);
	if (!file) return undefined;
	const registry = readRegistry(file);
	if (!registry) return undefined;
	const fanouts = (registry.children ?? []).filter(
		(child) => child.parentRunId === chairmanRunId,
	);
	if (fanouts.length === 0) return undefined;
	const current = fanouts.reduce((newest, child) =>
		(child.startedAt ?? 0) >= (newest.startedAt ?? 0) ? child : newest,
	);
	const steps = current.steps ?? [];
	const nested = researcherRuns(registry, current);
	const seats = steps.map((step, index) => {
		const runs = nested.filter((child) => child.parentStepIndex === index);
		const researcherSteps = runs.flatMap((child) => child.steps ?? []);
		return {
			index,
			status: String(step.status ?? "running"),
			researchersComplete: countStatus(researcherSteps, isComplete),
			researchersTotal: researcherSteps.length,
		};
	});
	const researcherSteps = nested.flatMap((child) => child.steps ?? []);
	const costUsd = (registry.children ?? []).reduce(
		(total, child) => total + (child.totalCost?.costUsd ?? 0),
		0,
	);
	return {
		updatedAt: Math.max(
			registry.updatedAt ?? 0,
			current.lastUpdate ?? 0,
			current.startedAt ?? 0,
		),
		agent: String(current.agent ?? "council-member"),
		seats,
		running: seats.filter(
			(seat) => !isComplete(seat.status) && !isFailed(seat.status),
		).length,
		complete: seats.filter((seat) => isComplete(seat.status)).length,
		failed: seats.filter((seat) => isFailed(seat.status)).length,
		researchersRunning: researcherSteps.filter(
			(step) =>
				!isComplete(String(step.status ?? "")) &&
				!isFailed(String(step.status ?? "")),
		).length,
		researchersComplete: countStatus(researcherSteps, isComplete),
		researchersTotal: researcherSteps.length,
		...(costUsd > 0 ? { costUsd } : undefined),
	};
}
