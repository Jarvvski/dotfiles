import { randomUUID } from "node:crypto";
import * as filesystem from "node:fs";
import { complete, type UserMessage } from "@earendil-works/pi-ai/compat";
import type { Usage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ScopedModel,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	COUNCIL_STATE_DIR,
	type CouncilConfig,
	type CouncilManifest,
	type CouncilMember,
	clearCheckpoint,
	listDebateTranscripts,
	listManifests,
	listProgress,
	loadDebateTranscript,
	loadProgress,
	loadCouncilConfig,
	loadManifest,
	memberRoster,
	normalizeModelId,
	salvageManifest,
	saveCouncilConfig,
	shortTopic,
	validateMemberCount,
	writeManifest,
	writeProgress,
} from "./protocol.ts";
import { CouncilChamberAnimation } from "./animation.ts";

const STATE_DIR = COUNCIL_STATE_DIR;
const RPC_REQUEST = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";
const ASYNC_COMPLETE = "subagent:async-complete";
const WATCHDOG_INTERVAL_MS = 2_000;
/** Time allowed for the async-complete event to arrive after a terminal phase. */
const COMPLETION_GRACE_MS = 90_000;
const TIMEOUT_GRACE_MS = 60_000;
const activeRuns = new Map<
	string,
	{
		runId: string;
		sessionId?: string;
		externalRunId?: string;
		resolveCompletion?: (completion: CouncilCompletion) => void;
	}
>();

interface RpcReply {
	success: boolean;
	data?: { text?: string; details?: unknown };
	error?: { message?: string };
}

interface CouncilCompletion {
	runId: string;
	success: boolean;
	manifest?: CouncilManifest;
	usage?: Usage;
	error?: string;
}

interface CouncilLaunch {
	runId: string;
	completion: Promise<CouncilCompletion>;
	animation: CouncilChamberAnimation;
}

function ensureStateDir(): void {
	filesystem.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

function rpcReplyEvent(requestId: string): string {
	return `${RPC_REPLY_PREFIX}${requestId}`;
}

function rpcCall(
	pi: Pick<ExtensionAPI, "events">,
	method: string,
	params: Record<string, unknown>,
): Promise<RpcReply> {
	const requestId = randomUUID();
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			unsubscribe?.();
			reject(new Error(`Timed out waiting for subagent RPC ${method}.`));
		}, 15_000);
		let unsubscribe: (() => void) | undefined;
		unsubscribe = pi.events.on(rpcReplyEvent(requestId), (raw) => {
			clearTimeout(timeout);
			unsubscribe?.();
			resolve(raw as RpcReply);
		});
		pi.events.emit(RPC_REQUEST, {
			version: 1,
			requestId,
			method,
			params,
			source: { extension: "council" },
		});
	});
}

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function finiteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function collectSessionFiles(value: unknown, files: Set<string>): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const record = value as Record<string, unknown>;
	if (typeof record.sessionFile === "string" && record.sessionFile)
		files.add(record.sessionFile);
	for (const key of ["results", "nestedChildren", "children", "steps"]) {
		const nested = record[key];
		if (Array.isArray(nested))
			for (const item of nested) collectSessionFiles(item, files);
		else collectSessionFiles(nested, files);
	}
}

function addUsage(target: Usage, raw: unknown): void {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
	const value = raw as Record<string, unknown>;
	const input = finiteNumber(value.input ?? value.inputTokens);
	const output = finiteNumber(value.output ?? value.outputTokens);
	const cacheRead = finiteNumber(value.cacheRead);
	const cacheWrite = finiteNumber(value.cacheWrite);
	const cost =
		value.cost && typeof value.cost === "object"
			? (value.cost as Record<string, unknown>)
			: {};
	target.input += input;
	target.output += output;
	target.cacheRead += cacheRead;
	target.cacheWrite += cacheWrite;
	target.totalTokens +=
		finiteNumber(value.totalTokens) || input + output + cacheRead + cacheWrite;
	target.cost.input += finiteNumber(cost.input);
	target.cost.output += finiteNumber(cost.output);
	target.cost.cacheRead += finiteNumber(cost.cacheRead);
	target.cost.cacheWrite += finiteNumber(cost.cacheWrite);
	target.cost.total += finiteNumber(cost.total);
}

function readSessionUsage(sessionFile: string): Usage {
	const usage = emptyUsage();
	try {
		for (const line of filesystem
			.readFileSync(sessionFile, "utf8")
			.split("\n")) {
			if (!line.trim()) continue;
			const entry = JSON.parse(line) as {
				usage?: unknown;
				message?: { usage?: unknown };
			};
			addUsage(usage, entry.usage ?? entry.message?.usage);
		}
	} catch {
		return usage;
	}
	return usage;
}

function applyAsyncCostSummary(usage: Usage, result: unknown): void {
	if (!result || typeof result !== "object") return;
	const summary = (result as { totalCost?: unknown }).totalCost;
	if (!summary || typeof summary !== "object") return;
	const cost = summary as {
		inputTokens?: unknown;
		outputTokens?: unknown;
		costUsd?: unknown;
	};
	const input = finiteNumber(cost.inputTokens);
	const output = finiteNumber(cost.outputTokens);
	usage.input = Math.max(usage.input, input);
	usage.output = Math.max(usage.output, output);
	usage.totalTokens = Math.max(
		usage.totalTokens,
		input + output + usage.cacheRead + usage.cacheWrite,
	);
	usage.cost.total = Math.max(usage.cost.total, finiteNumber(cost.costUsd));
}

function hasUsage(usage: Usage): boolean {
	return Boolean(
		usage.input ||
			usage.output ||
			usage.cacheRead ||
			usage.cacheWrite ||
			usage.cost.total,
	);
}

function usageFromAsyncResult(result: unknown): Usage | undefined {
	const usage = emptyUsage();
	const files = new Set<string>();
	collectSessionFiles(result, files);
	for (const sessionFile of files)
		addUsage(usage, readSessionUsage(sessionFile));
	applyAsyncCostSummary(usage, result);
	return hasUsage(usage) ? usage : undefined;
}

function availableModelIds(ctx: ExtensionContext): string[] {
	const scoped =
		ctx.scopedModels.length > 0
			? ctx.scopedModels.map(
					(entry: ScopedModel) => `${entry.model.provider}/${entry.model.id}`,
				)
			: ctx.modelRegistry
					.getAvailable()
					.map((model) => `${model.provider}/${model.id}`);
	return [...new Set(scoped)];
}

function modelFamily(modelId: string): string {
	const normalized = modelId.toLowerCase();
	if (normalized.startsWith("anthropic/")) return "anthropic";
	if (normalized.startsWith("openai/")) return "openai";
	if (normalized.includes("deepseek")) return "deepseek";
	if (normalized.includes("kimi") || normalized.includes("moonshot"))
		return "kimi";
	if (normalized.includes("grok") || normalized.includes("xai")) return "grok";
	if (normalized.includes("minimax")) return "minimax";
	if (normalized.includes("qwen")) return "qwen";
	if (normalized.includes("mistral")) return "mistral";
	return normalized.split("/")[0] ?? normalized;
}

function matchesModelPattern(modelId: string, pattern: string): boolean {
	const escaped = pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`).test(
		modelId.toLowerCase(),
	);
}

function modelVersion(modelId: string): number[] {
	return [...modelId.matchAll(/\d+(?:\.\d+)?/g)].map((match) =>
		Number(match[0]),
	);
}

function compareNewest(left: string, right: string): number {
	const leftVersion = modelVersion(left);
	const rightVersion = modelVersion(right);
	const length = Math.max(leftVersion.length, rightVersion.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (rightVersion[index] ?? 0) - (leftVersion[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return left.localeCompare(right);
}

function chooseModel(
	ids: string[],
	patterns: string[],
	usedFamilies: Set<string>,
	allowedPatterns: string[],
): string | undefined {
	const allowed = ids.filter((id) =>
		allowedPatterns.some((pattern) => matchesModelPattern(id, pattern)),
	);
	for (const pattern of patterns) {
		const candidates = allowed.filter(
			(id) =>
				id.toLowerCase().includes(pattern) &&
				!usedFamilies.has(modelFamily(id)),
		);
		if (candidates.length > 0) return candidates.sort(compareNewest)[0];
	}
	const unused = allowed.filter((id) => !usedFamilies.has(modelFamily(id)));
	return [...unused, ...allowed].sort(compareNewest)[0];
}

function buildRoster(
	ctx: ExtensionContext,
	count: 3 | 5 | 7,
	allowedPatterns: string[],
): {
	chairmanModel?: string;
	researcherModel?: string;
	members: CouncilMember[];
	warning?: string;
} {
	const ids = availableModelIds(ctx);
	const usedFamilies = new Set<string>();
	const chairmanModel = chooseModel(
		ids,
		["anthropic/claude-opus", "openai/gpt-5.6", "anthropic/claude-sonnet"],
		usedFamilies,
		allowedPatterns,
	);
	if (chairmanModel) usedFamilies.add(modelFamily(chairmanModel));
	const researcherModel = chooseModel(
		ids,
		["anthropic/claude-sonnet", "openai/gpt-5.6", "anthropic/claude-opus"],
		new Set(),
		allowedPatterns,
	);
	const members = memberRoster(count).map((member, index) => {
		const model = chooseModel(
			ids,
			[
				index === 0 ? "openai/gpt-5.6" : "",
				index === 1 ? "anthropic/claude-opus" : "",
				index === 2 ? "anthropic/claude-sonnet" : "",
				index === 3 ? "openai/gpt-5.6" : "",
				index === 4 ? "anthropic/claude-opus" : "",
				index === 5 ? "openai/gpt-5.6" : "",
				index === 6 ? "anthropic/claude-sonnet" : "",
			].filter(Boolean),
			usedFamilies,
			allowedPatterns,
		);
		if (model) usedFamilies.add(modelFamily(model));
		return { ...member, model: model ?? chairmanModel ?? "" };
	});
	const families = new Set(
		members.map((member) => modelFamily(member.model)).filter(Boolean),
	);
	return {
		chairmanModel,
		researcherModel,
		members,
		warning:
			families.size < members.length
				? `Model diversity limited: ${families.size} model families for ${members.length} seats; member biases remain distinct.`
				: undefined,
	};
}

function chairmanTask(
	question: string,
	runId: string,
	roster: ReturnType<typeof buildRoster>,
	config: CouncilConfig,
): string {
	return [
		`You are the single non-voting chairman for council run ${runId}.`,
		`Question: ${question}`,
		`Council roster JSON: ${JSON.stringify(roster.members)}`,
		`Researcher model: ${roster.researcherModel ?? "use the strongest available low-cost model"}`,
		`Timing: researcher timeout ${config.researcherTimeoutMs}ms; member timeout ${config.memberTimeoutMs}ms; participant timeout ${config.participantTimeoutMs}ms; chairman timeout ${config.chairmanTimeoutMs}ms.`,
		`Research limits: at most ${config.maxResearchQueries} web search queries and ${config.maxResearchSources} sources per researcher.`,
		"Set timeoutMs on every top-level fanout. Use the researcher timeout for each member's two-researcher dispatch, the member timeout for the member fanout, and the participant timeout for alignment, voting, and reconciliation fanouts. Treat a timed-out fanout as a partial failure, identify the timed-out seat, and replace it using the existing replacement rules.",
		"",
		"Use council_progress throughout the run. Start with phase=starting, then report member-research, proposals, alignment, voting, reconciliation when needed, and publishing. Include completed and total counts whenever a phase processes seats. Update progress after each completed seat when possible. Never wait silently between phases. The progress message must name the current operation and identify any seat that is still pending.",
		"Every council_progress call must also include the seats array with one entry per current seat so the human operator can watch the chamber. Use memberId (C1 through C7) and one activity from: seated, briefing, researching, research-complete, drafting, proposed, aligning, ready, voted-yes, voted-no, reconciling, replaced, stalled, failed. Set researchersPending to the number of that seat's two researchers still outstanding while activity=researching. Use detail for a short tag of at most 12 characters, such as a proposal ID for proposed, the sponsored proposal for ready, the proposal being voted on for voted-yes and voted-no, or the attempt number for replaced. Mark a seat stalled when it has not reported within its timeout.",
		"When a specific proposal is on the floor during proposals, alignment, voting, or reconciliation, include focus with proposalId, a short title, and the running yes and no counts. Clear focus when no single proposal is being considered.",
		"Run the council in these machine-auditable phases:",
		"1. Launch exactly one council-member task per roster seat in parallel. Each member must dispatch exactly two council-researcher tasks with the research timeout, then return JSON containing its seat ID, research summaries, proposal(s), proposal IDs, confidence, and dissent. Update council_progress after each seat completes or times out.",
		"2. Freeze the unique proposal set. Ensure at least one proposal exists, using C1 Atlas's proposal if necessary. Do not invent a substantive proposal yourself.",
		"3. Launch one council-participant task per current seat with the frozen question, roster, research summaries, and proposals using the participant timeout. Require sponsorship or alignment, conflict declarations, a readiness statement, and readyToVote=true. Also require phase=alignment, a publicArgument of at most 320 characters that states the seat's core case for the human-visible debate ticker, and challenges as [{targetMemberId, proposalId, text}] naming any specific seat or proposal claim it disputes. Do not start voting until every seat is ready.",
		"3a. If alignment reveals any direct challenge or any medium/high proposal conflict, run one fresh alignment-debate participant fanout before voting. Give every participant all public arguments and challenges. Require phase=alignment-debate, a concise publicArgument, and responses as [{targetMemberId, proposalId, claim, text}] for at most two challenged claims. This is a genuine response round: each seat must address another seat's actual words rather than independently restating its own proposal. Update council_progress to say the response round is in flight. This round does not alter the frozen proposals or add fields to the manifest.",
		"4. Launch a fresh council-participant voting task per current seat using the participant timeout. Give it all alignment arguments and any response-round records. Require phase=voting and ballots as [{proposalId, vote, rationale}] with exactly one YES or NO for every proposal. Do not vote yourself. Compute the result using strict majority floor(N/2)+1.",
		"5. If accepted proposals have declared conflicts, run exactly one reconciliation phase with fresh participants and a complete re-vote. Give every participant the prior public arguments, challenges, responses, vote rationales, and accepted conflicts. Require phase=reconciliation, responses as [{targetMemberId, proposalId, claim, text}] directed to the conflicting seats, a concise publicArgument, and ballots as [{proposalId, vote, rationale}] for the complete re-vote. This must be a moderated exchange grounded in other seats' actual claims, not isolated reconsideration. If conflicts remain, report UNRESOLVED_CONFLICT.",
		"6. If a member or researcher fails, replace that logical seat with a fresh attempt, up to two replacements per seat. Ignore stale attempts. If a seat exhausts replacements, report INCOMPLETE.",
		"Checkpoint after every completed phase with council_checkpoint before starting the next phase: the roster and run metadata after the roster is confirmed, research and members after the member fanout, proposals once frozen, readiness after alignment, votes after the ballot, and conflicts plus reconciliationRounds after any reconciliation. Checkpointed sections are merged into council_publish automatically, and a checkpointed run can be salvaged if you are killed before publishing. Never repeat a phase that is already checkpointed.",
		"Publishing is time-critical. As soon as the tally is computed, call council_publish immediately. Do not restate research verbatim, do not draft the report before the tally, and keep the report to a concise procedural record plus the substantive outcome. A council that times out before publishing loses the entire run.",
		"Field names in the manifest are fixed. Members use id; research, readiness, and votes use memberId. Never use seatId anywhere. Votes are a single flat array with one record per member per proposal, never ballots nested inside a per-seat object, and no voteTally field is read because the tally is machine-computed. Research is a flat array with exactly two records per member. The phase, publicArgument, challenges, and responses fields belong only to participant outputs for the live debate transcript; do not add them to the manifest or checkpoint patches.",
		"If council_publish rejects the manifest, read the validation message literally and correct exactly the field it names. Do not guess alternative vocabularies and do not contact the supervisor about the manifest schema; the accepted status tokens are CONSENSUS, NO_CONSENSUS, UNRESOLVED_CONFLICT, and INCOMPLETE.",
		"7. Call council_publish exactly once with a complete manifest. Top-level fields, all required: version, runId, createdAt, question, memberCount, status, members, research, proposals, readiness, votes, acceptedProposalIds, conflicts, reconciliationRounds, report. Optional: chairmanModel, researcherModel, modelWarning. There is no nested outcome object; a nested outcome.status is never read. manifest.status must be exactly one of CONSENSUS, NO_CONSENSUS, UNRESOLVED_CONFLICT, or INCOMPLETE. Use CONSENSUS when at least one proposal was accepted by strict majority and no two accepted proposals remain in conflict, even when individual members hold recorded dissent. Use NO_CONSENSUS when no proposal was accepted, and then acceptedProposalIds must be empty. Use UNRESOLVED_CONFLICT only when two accepted proposals remain in conflict after reconciliation. Use INCOMPLETE only when a seat exhausted its replacements. Never invent another status token, never lowercase it, and never place conditions or dissent in status; record those in the member records, readiness, votes, and report prose. conflicts must not contain an edge whose two endpoints are both accepted proposals unless the status is UNRESOLVED_CONFLICT. Pass manifest as a native object, not a prose block or quoted report; the validator also accepts a JSON-encoded object if the runtime serializes tool arguments. The tool validates the manifest. Your final response must be the same report and must not claim that you voted or made substantive decisions.",
		"",
		"Use the subagent tool only for the specified council-member and council-participant work. Do not research yourself. Keep IDs, names, biases, models, and attempts visible in every phase.",
	].join("\n");
}

interface PreparedCouncil {
	trimmed: string;
	count: 3 | 5 | 7;
	roster: ReturnType<typeof buildRoster>;
	config: CouncilConfig;
}

function prepareCouncil(
	ctx: ExtensionContext,
	question: string,
): PreparedCouncil | undefined {
	const trimmed = question.trim();
	if (!trimmed) {
		ctx.ui.notify("Council question cannot be empty.", "error");
		return undefined;
	}
	if (activeRuns.size > 0) {
		ctx.ui.notify("A council is already active in this Pi session.", "warning");
		return undefined;
	}
	const config = loadCouncilConfig();
	const count = validateMemberCount(config.memberCount);
	const roster = buildRoster(ctx, count, config.allowedModelPatterns);
	if (!roster.chairmanModel) {
		ctx.ui.notify(
			"No authenticated model is available for the chairman.",
			"error",
		);
		return undefined;
	}
	return { trimmed, count, roster, config };
}

function confirmCouncil(
	ctx: ExtensionContext,
	prepared: PreparedCouncil,
	reason: string | undefined,
	confirmed: boolean,
): Promise<boolean> {
	if (confirmed || !ctx.hasUI) return Promise.resolve(true);
	const summary = [
		`Question: ${prepared.trimmed}`,
		reason ? `Reason: ${reason}` : undefined,
		`Council size: ${prepared.count}`,
		`Members: ${prepared.roster.members.map((member) => `${member.id} ${member.name}`).join(", ")}`,
		"Expected minimum: chairman + members + two researchers per member.",
		prepared.roster.warning,
	]
		.filter(Boolean)
		.join("\n");
	return ctx.ui.confirm("Convene council?", summary);
}

/**
 * Decide a council outcome from durable state: a published manifest first, then a
 * checkpoint salvage, and only then a failure. Salvage means a chairman that dies
 * after voting still produces an auditable record instead of losing the whole run.
 */
function resolveOutcome(
	runId: string,
	failureMessage: string,
): CouncilCompletion {
	const manifest = loadManifest(runId) ?? salvageManifest(runId);
	if (manifest) {
		if (!loadManifest(runId)) {
			writeManifest(manifest);
			clearCheckpoint(runId);
		}
		writeProgress({
			version: 1,
			runId,
			updatedAt: Date.now(),
			phase: "complete",
			message: manifest.salvaged
				? "Council record salvaged from checkpoints after the chairman ended."
				: "Council report published.",
			status: "COMPLETE",
		});
		return { runId, success: true, manifest };
	}
	writeProgress({
		version: 1,
		runId,
		updatedAt: Date.now(),
		phase: "failed",
		message: failureMessage,
		status: "FAILED",
	});
	return { runId, success: false, error: failureMessage };
}

async function launchChairman(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext | ExtensionContext,
	prepared: PreparedCouncil,
): Promise<CouncilLaunch> {
	ensureStateDir();
	const runId = `council-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
	const launchedAt = Date.now();
	let resolveCompletion: (completion: CouncilCompletion) => void = () =>
		undefined;
	const completion = new Promise<CouncilCompletion>((resolve) => {
		resolveCompletion = resolve;
	});
	let settled = false;
	let watchdog: ReturnType<typeof setInterval> | undefined;
	const settle = (result: CouncilCompletion): void => {
		if (settled) return;
		settled = true;
		if (watchdog) clearInterval(watchdog);
		watchdog = undefined;
		activeRuns.delete(runId);
		resolveCompletion(result);
	};
	/**
	 * The async-complete event is the primary completion signal because it carries
	 * nested usage. This watchdog is the safety net: if that event never
	 * correlates, a published or failed council must still release the session.
	 */
	let terminalSince: number | undefined;
	watchdog = setInterval(() => {
		const now = Date.now();
		const progress = loadProgress(runId);
		const terminal =
			progress?.status === "COMPLETE" || progress?.status === "FAILED";
		if (terminal) terminalSince ??= now;
		else terminalSince = undefined;
		const timedOut =
			now - launchedAt > prepared.config.chairmanTimeoutMs + TIMEOUT_GRACE_MS;
		if (
			!timedOut &&
			(!terminalSince || now - terminalSince < COMPLETION_GRACE_MS)
		)
			return;
		settle(
			resolveOutcome(
				runId,
				timedOut
					? "Chairman run exceeded its timeout without publishing a council report."
					: (progress?.message ??
							"Chairman run ended before publishing a council report."),
			),
		);
	}, WATCHDOG_INTERVAL_MS);
	watchdog.unref?.();
	activeRuns.set(runId, {
		runId,
		sessionId: ctx.sessionManager.getSessionId() ?? undefined,
		resolveCompletion: settle,
	});
	writeProgress({
		version: 1,
		runId,
		updatedAt: Date.now(),
		phase: "starting",
		message: "Chairman launched; waiting for the first council phase.",
		total: prepared.count,
		status: "RUNNING",
	});
	const animation = new CouncilChamberAnimation(ctx, runId, prepared.count);
	animation.start();
	try {
		const reply = await rpcCall(pi, "spawn", {
			agent: "council-chairman",
			model: prepared.roster.chairmanModel,
			task: chairmanTask(
				prepared.trimmed,
				runId,
				prepared.roster,
				prepared.config,
			),
			async: true,
			timeoutMs: prepared.config.chairmanTimeoutMs,
			cwd: ctx.cwd,
			agentScope: "user",
			confirmProjectAgents: false,
			// The council is procedural and publishes its own validated record, so it
			// must not require an independent reviewer handoff to be accepted.
			acceptance: "checked",
		});
		if (!reply.success)
			throw new Error(reply.error?.message ?? "Chairman launch failed.");
		const details = reply.data?.details as
			| { results?: Array<{ id?: string }> }
			| undefined;
		const externalRunId = details?.results?.find(
			(result) => typeof result.id === "string",
		)?.id;
		const active = activeRuns.get(runId);
		if (active && externalRunId) active.externalRunId = externalRunId;
		animation.setChairmanRunId(externalRunId);
		return { runId, completion, animation };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		settle({ runId, success: false, error: message });
		await animation.finish(false, message);
		writeProgress({
			version: 1,
			runId,
			updatedAt: Date.now(),
			phase: "failed",
			message,
			status: "FAILED",
		});
		resolveCompletion({ runId, success: false, error: message });
		throw error;
	}
}

async function startCouncil(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext | ExtensionContext,
	question: string,
	reason?: string,
	confirmed = false,
): Promise<CouncilCompletion | undefined> {
	const prepared = prepareCouncil(ctx, question);
	if (!prepared || !(await confirmCouncil(ctx, prepared, reason, confirmed)))
		return undefined;
	try {
		const launch = await launchChairman(pi, ctx, prepared);
		let completion: CouncilCompletion | undefined;
		try {
			ctx.ui.notify(
				`Council ${launch.runId} convened with ${prepared.count} members.`,
				"info",
			);
			completion = await launch.completion;
			ctx.ui.notify(
				completion.success
					? `Council ${launch.runId} completed.`
					: `Council ${launch.runId} failed: ${completion.error ?? "unknown error"}`,
				completion.success ? "info" : "error",
			);
			return completion;
		} finally {
			await launch.animation.finish(
				completion?.success ?? false,
				completion?.error,
			);
		}
	} catch (error) {
		ctx.ui.notify(
			error instanceof Error ? error.message : String(error),
			"error",
		);
		return undefined;
	}
}

function formatRun(manifest: CouncilManifest): string {
	return `${new Date(manifest.createdAt).toLocaleString()} | ${shortTopic(manifest.question, 55)} | ${manifest.memberCount} members | ${manifest.status}`;
}

interface AskSelection {
	run: CouncilManifest;
	member: CouncilMember;
	question: string;
}

function memberLabel(member: CouncilMember): string {
	return `${member.id} ${member.name} | ${member.bias} | ${member.model} | ${member.finalStance ?? "no stance"}`;
}

function resolveDirectAsk(
	args: string,
	manifests: CouncilManifest[],
): AskSelection | undefined {
	const direct = args.trim().match(/^(?:(\S+):)?(C[1-7])\s+([\s\S]+)$/i);
	if (!direct) return undefined;
	const memberId = direct[2]?.toLowerCase();
	if (!memberId) return undefined;
	const run = direct[1]
		? manifests.find((manifest) => manifest.runId === direct[1])
		: manifests[0];
	const member = run?.members.find(
		(candidate) => candidate.id.toLowerCase() === memberId,
	);
	const question = direct[3]?.trim();
	return run && member && question ? { run, member, question } : undefined;
}

async function selectAskTarget(
	ctx: ExtensionCommandContext,
	manifests: CouncilManifest[],
): Promise<AskSelection | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Usage: /council-ask [run-id:]C3 question", "error");
		return undefined;
	}
	const runChoice = await ctx.ui.select(
		"Select a council run",
		manifests.map(formatRun),
	);
	const run = runChoice
		? manifests.find((manifest) => formatRun(manifest) === runChoice)
		: undefined;
	if (!run) return undefined;
	const memberChoice = await ctx.ui.select(
		"Select a councillor",
		run.members.map(memberLabel),
	);
	const member = memberChoice
		? run.members.find((candidate) =>
				memberChoice.startsWith(`${candidate.id} ${candidate.name}`),
			)
		: undefined;
	if (!member) return undefined;
	const question =
		(await ctx.ui.editor("Question for this councillor", ""))?.trim() ?? "";
	return question ? { run, member, question } : undefined;
}

async function resolveAskTarget(
	ctx: ExtensionCommandContext,
	args: string,
): Promise<AskSelection | undefined> {
	const manifests = listManifests().sort((a, b) => b.createdAt - a.createdAt);
	if (manifests.length === 0) {
		ctx.ui.notify("No completed council runs are available.", "info");
		return undefined;
	}
	return (
		resolveDirectAsk(args, manifests) ?? (await selectAskTarget(ctx, manifests))
	);
}

function buildDossierMessage(selection: AskSelection): UserMessage {
	const { run, member, question } = selection;
	return {
		role: "user",
		content: [
			{
				type: "text",
				text: [
					`You are ${member.id} ${member.name}, a logical councillor in council run ${run.runId}.`,
					`Your bias: ${member.bias}.`,
					"Answer dossier-only. Do not research, browse, use files, or change the historical council record.",
					`Original question: ${run.question}`,
					`Your dossier: ${JSON.stringify({ member, proposals: run.proposals, votes: run.votes, research: run.research })}`,
					`Human follow-up: ${question}`,
				].join("\n\n"),
			},
		],
		timestamp: Date.now(),
	};
}

async function answerMember(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	selection: AskSelection,
): Promise<void> {
	const modelId = normalizeModelId(selection.member.model);
	const model = ctx.modelRegistry.find(modelId.provider, modelId.id);
	if (!model)
		throw new Error(
			`The original councillor model is unavailable: ${selection.member.model}`,
		);
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey)
		throw new Error(auth.ok ? `No API key for ${model.provider}.` : auth.error);
	const response = await complete(
		model,
		{ messages: [buildDossierMessage(selection)] },
		{ apiKey: auth.apiKey, headers: auth.headers, env: auth.env },
	);
	const text = response.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n")
		.trim();
	pi.sendMessage({
		customType: "council-ask",
		content: `**${selection.member.id} ${selection.member.name}**\n\n${text || "No response."}`,
		display: true,
		details: { runId: selection.run.runId, memberId: selection.member.id },
	});
}

function debatePhaseLabel(phase: string): string {
	return phase
		.split("-")
		.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}

async function showCouncilTranscript(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string,
): Promise<void> {
	const transcripts = listDebateTranscripts();
	if (transcripts.length === 0) {
		ctx.ui.notify("No council debate transcripts are available.", "info");
		return;
	}
	const requested = args.trim();
	let runId = requested;
	if (!runId && ctx.mode === "tui") {
		const options = transcripts.map((transcript) => {
			const manifest = loadManifest(transcript.runId);
			return manifest
				? `${transcript.runId} | ${shortTopic(manifest.question, 60)}`
				: transcript.runId;
		});
		const selected = await ctx.ui.select("Select a council debate", options);
		runId = selected?.split(" | ")[0] ?? "";
	}
	if (!runId) {
		ctx.ui.notify("Usage: /council-transcript <run-id>", "error");
		return;
	}
	const transcript = loadDebateTranscript(runId);
	if (!transcript) {
		ctx.ui.notify(`No debate transcript found for ${runId}.`, "error");
		return;
	}
	const manifest = loadManifest(runId);
	const lines = [
		`# Council debate: ${runId}`,
		...(manifest ? [`\n**Question:** ${manifest.question}`] : []),
	];
	let phase = "";
	for (const statement of transcript.statements) {
		if (statement.phase !== phase) {
			phase = statement.phase;
			lines.push(`\n## ${debatePhaseLabel(phase)}`);
		}
		const target = statement.targetMemberId
			? ` to ${statement.targetMemberId}`
			: "";
		const proposal = statement.proposalId ? ` on ${statement.proposalId}` : "";
		const kind =
			statement.kind === "vote" && statement.vote
				? `vote ${statement.vote}`
				: statement.kind;
		lines.push(
			`- **${statement.memberName} - ${kind}${target}${proposal}:** ${statement.text}`,
		);
	}
	pi.sendMessage({
		customType: "council-transcript",
		content: lines.join("\n"),
		display: true,
		details: { runId, statementCount: transcript.statements.length },
	});
}

async function askMember(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string,
): Promise<void> {
	const selection = await resolveAskTarget(ctx, args);
	if (!selection) {
		ctx.ui.notify(
			"Council run, councillor, or question was not found.",
			"error",
		);
		return;
	}
	try {
		await answerMember(pi, ctx, selection);
	} catch (error) {
		ctx.ui.notify(
			error instanceof Error ? error.message : String(error),
			"error",
		);
	}
}

async function handleCouncilSettings(
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const value =
		args.trim() ||
		(ctx.mode === "tui"
			? await ctx.ui.select("Council size", ["3", "5", "7"])
			: undefined);
	if (!value) return;
	try {
		const memberCount = validateMemberCount(Number(value));
		saveCouncilConfig({ ...loadCouncilConfig(), memberCount });
		ctx.ui.notify(`Council size set to ${memberCount}.`, "info");
	} catch (error) {
		ctx.ui.notify(
			error instanceof Error ? error.message : String(error),
			"error",
		);
	}
}

function formatCouncilProgress(
	progress: ReturnType<typeof listProgress>[number],
): string {
	const count =
		progress.completed !== undefined && progress.total !== undefined
			? ` ${progress.completed}/${progress.total}`
			: "";
	const age = `${Math.max(0, Math.floor((Date.now() - progress.updatedAt) / 1000))}s ago`;
	return `${progress.status} ${progress.runId} | ${progress.phase}${count} | ${age} | ${progress.message}`;
}

async function handleCouncilStatus(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const requestedRunId = args.trim();
	const progress = listProgress().filter(
		(entry) => !requestedRunId || entry.runId === requestedRunId,
	);
	if (progress.length === 0) {
		ctx.ui.notify(
			requestedRunId
				? `No progress found for council ${requestedRunId}.`
				: "No council progress is available.",
			"info",
		);
		return;
	}
	const lines = [
		"Council progress:",
		...progress.slice(0, 10).map(formatCouncilProgress),
	];
	for (const entry of progress.slice(0, 10)) {
		const active = activeRuns.get(entry.runId);
		if (!active?.externalRunId || entry.status !== "RUNNING") continue;
		try {
			const reply = await rpcCall(pi, "status", { id: active.externalRunId });
			const detail = reply.success
				? reply.data?.text?.replace(/\s+/g, " ").trim()
				: undefined;
			if (detail) lines.push(`${entry.runId} live: ${detail.slice(0, 600)}`);
		} catch {
			lines.push(`${entry.runId} live: status unavailable`);
		}
	}
	ctx.ui.notify(lines.join("\n"), "info");
}

function registerCouncilCommands(pi: ExtensionAPI): void {
	pi.registerCommand("council", {
		description: "Convene an adversarial council for a consequential question",
		handler: async (args, ctx) => {
			const question =
				args.trim() ||
				(ctx.mode === "tui"
					? ((await ctx.ui.input("Council question", "")) ?? "")
					: "");
			await startCouncil(pi, ctx, question, undefined, true);
		},
	});
	pi.registerCommand("council-status", {
		description: "Show active and recent council progress",
		handler: (args, ctx) => handleCouncilStatus(pi, args, ctx),
	});
	pi.registerCommand("council-settings", {
		description: "Configure council membership",
		handler: (args, ctx) => handleCouncilSettings(args, ctx),
	});
	pi.registerCommand("council-ask", {
		description: "Ask a councillor about a completed council run",
		handler: (args, ctx) => askMember(pi, ctx, args),
	});
	pi.registerCommand("council-transcript", {
		description:
			"Show the arguments, challenges, replies, and vote rationales from a council run",
		handler: (args, ctx) => showCouncilTranscript(pi, ctx, args),
	});
}

function registerCouncilTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "council",
		label: "Council",
		description:
			"Convene a multi-member adversarial council for a consequential design or strategy question.",
		promptSnippet:
			"Convene a human-confirmed adversarial council for a consequential decision",
		promptGuidelines: [
			"Use council when a consequential question has several defensible options, substantial uncertainty, or conflicting tradeoffs. Do not use council for routine implementation or facts.",
		],
		parameters: Type.Object({
			question: Type.String(),
			reason: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const completion = await startCouncil(
				pi,
				ctx,
				params.question,
				params.reason,
				false,
			);
			if (!completion) {
				return {
					content: [
						{
							type: "text",
							text: "Council was not started. The human confirmation gate may have declined it.",
						},
					],
					details: {},
				};
			}
			return {
				content: [
					{
						type: "text",
						text:
							completion.manifest?.report ??
							completion.error ??
							"Council completed without a report.",
					},
				],
				details: {
					runId: completion.runId,
					status: completion.manifest?.status ?? "INCOMPLETE",
				},
				...(completion.usage ? { usage: completion.usage } : {}),
			};
		},
	});
}

function registerCompletionCleanup(pi: ExtensionAPI): void {
	pi.events.on(ASYNC_COMPLETE, (event: unknown) => {
		const result = event as {
			id?: string;
			totalCost?: unknown;
			results?: unknown[];
			nestedChildren?: unknown[];
		};
		if (!result.id) return;
		for (const [runId, active] of activeRuns) {
			const externalRunId = active.externalRunId;
			if (
				result.id !== runId &&
				!result.id.includes(runId) &&
				result.id !== externalRunId
			)
				continue;
			active.resolveCompletion?.({
				...resolveOutcome(
					runId,
					"Chairman run ended before publishing a council report.",
				),
				usage: usageFromAsyncResult(result),
			});
			activeRuns.delete(runId);
		}
	});
}

export default function councilExtension(pi: ExtensionAPI): void {
	ensureStateDir();
	registerCouncilCommands(pi);
	registerCouncilTool(pi);
	registerCompletionCleanup(pi);
}
