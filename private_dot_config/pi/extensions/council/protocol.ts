import * as filesystem from "node:fs";
import * as pathing from "node:path";

const EXTENSION_DIR = (() => {
	try {
		return pathing.dirname(new URL(import.meta.url).pathname);
	} catch {
		return process.cwd();
	}
})();
export const COUNCIL_STATE_DIR = pathing.join(EXTENSION_DIR, "state");
export const COUNCIL_CONFIG_PATH = pathing.join(EXTENSION_DIR, "config.json");

export const DEFAULT_ALLOWED_MODEL_PATTERNS = [
	"anthropic/claude-opus-5",
	"anthropic/claude-opus-4-8",
	"anthropic/claude-sonnet-5",
	"openai/gpt-5.6-*",
] as const;

export const DEFAULT_CONFIG: CouncilConfig = {
	version: 1,
	memberCount: 5,
	maxReplacementsPerSeat: 2,
	maxReconciliationRounds: 1,
	researcherTimeoutMs: 180000,
	memberTimeoutMs: 420000,
	participantTimeoutMs: 240000,
	chairmanTimeoutMs: 1800000,
	maxResearchQueries: 3,
	maxResearchSources: 5,
	allowedModelPatterns: [...DEFAULT_ALLOWED_MODEL_PATTERNS],
};

export interface CouncilConfig {
	version: number;
	memberCount: 3 | 5 | 7;
	maxReplacementsPerSeat: number;
	maxReconciliationRounds: number;
	researcherTimeoutMs: number;
	memberTimeoutMs: number;
	participantTimeoutMs: number;
	chairmanTimeoutMs: number;
	maxResearchQueries: number;
	maxResearchSources: number;
	allowedModelPatterns: string[];
}

export interface CouncilMember {
	id: string;
	name: string;
	bias: string;
	model: string;
	attempt?: number;
	finalStance?: string;
	ready?: boolean;
}

export interface ResearchRecord {
	memberId: string;
	researcherId: string;
	assignment: string;
	summary: string;
	sources?: string[];
	confidence?: string;
}

export interface Proposal {
	id: string;
	authorId: string;
	text: string;
	hash?: string;
	amendmentOf?: string;
}

export interface ReadinessRecord {
	memberId: string;
	attempt: number;
	supports: string[];
	opposes: string[];
	conflicts: Array<[string, string]>;
	statement: string;
	readyToVote: boolean;
}

export interface VoteRecord {
	memberId: string;
	attempt: number;
	proposalId: string;
	vote: "YES" | "NO";
	rationale?: string;
}

export type CouncilStatus =
	| "CONSENSUS"
	| "NO_CONSENSUS"
	| "UNRESOLVED_CONFLICT"
	| "INCOMPLETE";

export type CouncilProgressPhase =
	| "starting"
	| "member-research"
	| "proposals"
	| "alignment"
	| "voting"
	| "reconciliation"
	| "publishing"
	| "complete"
	| "failed";

export type CouncilSeatActivity =
	| "seated"
	| "briefing"
	| "researching"
	| "research-complete"
	| "drafting"
	| "proposed"
	| "aligning"
	| "ready"
	| "voted-yes"
	| "voted-no"
	| "reconciling"
	| "replaced"
	| "stalled"
	| "failed";

export interface CouncilSeatState {
	/** Stable seat identity, C1 through C7. */
	memberId: string;
	activity: CouncilSeatActivity;
	/** Short tag such as a proposal ID, attempt number, or stance. */
	detail?: string;
	/** Researchers still outstanding for this seat, 0 through 2. */
	researchersPending?: number;
}

export interface CouncilFocus {
	/** Proposal currently on the floor. */
	proposalId: string;
	title: string;
	yes?: number;
	no?: number;
}

export interface CouncilProgress {
	version: number;
	runId: string;
	updatedAt: number;
	phase: CouncilProgressPhase;
	message: string;
	completed?: number;
	total?: number;
	status: "RUNNING" | "COMPLETE" | "FAILED";
	seats?: CouncilSeatState[];
	focus?: CouncilFocus;
}

export type CouncilDebatePhase =
	| "alignment"
	| "alignment-debate"
	| "voting"
	| "reconciliation";

export interface CouncilDebateStatement {
	id: string;
	phase: CouncilDebatePhase;
	memberId: string;
	memberName: string;
	kind: "argument" | "challenge" | "response" | "vote" | "dissent";
	text: string;
	recordedAt: number;
	proposalId?: string;
	targetMemberId?: string;
	vote?: "YES" | "NO";
}

export interface CouncilDebateTranscript {
	version: 1;
	runId: string;
	updatedAt: number;
	statements: CouncilDebateStatement[];
}

export interface CouncilManifest {
	version: number;
	runId: string;
	createdAt: number;
	question: string;
	memberCount: number;
	status: CouncilStatus;
	chairmanModel?: string;
	researcherModel?: string;
	modelWarning?: string;
	members: CouncilMember[];
	research: ResearchRecord[];
	proposals: Proposal[];
	readiness: ReadinessRecord[];
	votes: VoteRecord[];
	acceptedProposalIds: string[];
	conflicts: Array<[string, string]>;
	reconciliationRounds: number;
	report: string;
	/** True when the extension assembled this record from checkpoints after the chairman died. */
	salvaged?: boolean;
}

export const COUNCIL_MEMBERS: readonly Omit<CouncilMember, "model">[] = [
	{
		id: "C1",
		name: "Atlas",
		bias: "Systems coherence and long-term architecture",
	},
	{
		id: "C2",
		name: "Forge",
		bias: "Pragmatic delivery, simplicity, and operational cost",
	},
	{
		id: "C3",
		name: "Cassandra",
		bias: "Adversarial risk, failure modes, and security",
	},
	{ id: "C4", name: "Hearth", bias: "Human, developer, and product impact" },
	{
		id: "C5",
		name: "Horizon",
		bias: "Innovation, optionality, and future leverage",
	},
	{
		id: "C6",
		name: "Ledger",
		bias: "Evidence quality, economics, and measurable outcomes",
	},
	{
		id: "C7",
		name: "Bridge",
		bias: "Integration, migration, compatibility, and sequencing",
	},
];

export function validateMemberCount(value: unknown): 3 | 5 | 7 {
	if (value === 3 || value === 5 || value === 7) return value;
	throw new Error("Council membership must be exactly 3, 5, or 7.");
}

export function memberRoster(count: 3 | 5 | 7): Omit<CouncilMember, "model">[] {
	return COUNCIL_MEMBERS.slice(0, count).map((member) => ({ ...member }));
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: fallback;
}

function normalizeModelPatterns(value: unknown): string[] {
	if (!Array.isArray(value)) return [...DEFAULT_ALLOWED_MODEL_PATTERNS];
	const patterns = value.flatMap((pattern) =>
		typeof pattern === "string" && pattern.trim().length > 0
			? [pattern.trim()]
			: [],
	);
	return patterns.length > 0
		? [...new Set(patterns)]
		: [...DEFAULT_ALLOWED_MODEL_PATTERNS];
}

export function loadCouncilConfig(): CouncilConfig {
	try {
		const parsed = JSON.parse(
			filesystem.readFileSync(COUNCIL_CONFIG_PATH, "utf8"),
		) as Partial<CouncilConfig>;
		return {
			...DEFAULT_CONFIG,
			...parsed,
			memberCount: validateMemberCount(
				parsed.memberCount ?? DEFAULT_CONFIG.memberCount,
			),
			researcherTimeoutMs: normalizePositiveNumber(
				parsed.researcherTimeoutMs,
				DEFAULT_CONFIG.researcherTimeoutMs,
			),
			memberTimeoutMs: normalizePositiveNumber(
				parsed.memberTimeoutMs,
				DEFAULT_CONFIG.memberTimeoutMs,
			),
			participantTimeoutMs: normalizePositiveNumber(
				parsed.participantTimeoutMs,
				DEFAULT_CONFIG.participantTimeoutMs,
			),
			chairmanTimeoutMs: normalizePositiveNumber(
				parsed.chairmanTimeoutMs,
				DEFAULT_CONFIG.chairmanTimeoutMs,
			),
			maxResearchQueries: normalizePositiveNumber(
				parsed.maxResearchQueries,
				DEFAULT_CONFIG.maxResearchQueries,
			),
			maxResearchSources: normalizePositiveNumber(
				parsed.maxResearchSources,
				DEFAULT_CONFIG.maxResearchSources,
			),
			allowedModelPatterns: normalizeModelPatterns(parsed.allowedModelPatterns),
		};
	} catch {
		return {
			...DEFAULT_CONFIG,
			allowedModelPatterns: [...DEFAULT_ALLOWED_MODEL_PATTERNS],
		};
	}
}

export function saveCouncilConfig(config: CouncilConfig): void {
	validateMemberCount(config.memberCount);
	const allowedModelPatterns = normalizeModelPatterns(
		config.allowedModelPatterns,
	);
	filesystem.mkdirSync(EXTENSION_DIR, { recursive: true, mode: 0o700 });
	const temporaryPath = `${COUNCIL_CONFIG_PATH}.${process.pid}.tmp`;
	filesystem.writeFileSync(
		temporaryPath,
		`${JSON.stringify({ ...config, allowedModelPatterns }, null, 2)}\n`,
		{
			mode: 0o600,
		},
	);
	filesystem.renameSync(temporaryPath, COUNCIL_CONFIG_PATH);
}

export function normalizeModelId(value: string): {
	provider: string;
	id: string;
} {
	const separator = value.indexOf("/");
	if (separator <= 0 || separator === value.length - 1)
		throw new Error(`Invalid model ID: ${value}`);
	return {
		provider: value.slice(0, separator),
		id: value.slice(separator + 1),
	};
}

export function shortTopic(question: string, maxLength = 60): string {
	const compact = question.replace(/\s+/g, " ").trim();
	return compact.length <= maxLength
		? compact
		: `${compact.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function strictMajority(memberCount: number): number {
	return Math.floor(memberCount / 2) + 1;
}

function conflictPair(value: unknown): [string, string] | undefined {
	if (Array.isArray(value)) {
		const left = typeof value[0] === "string" ? value[0].trim() : "";
		const right = typeof value[1] === "string" ? value[1].trim() : "";
		return left && right ? [left, right] : undefined;
	}
	if (!value || typeof value !== "object") return undefined;
	const conflict = value as Record<string, unknown>;
	if (conflict.resolved === true) return undefined;
	const listed = Array.isArray(conflict.for) ? conflict.for : [];
	const left = String(
		conflict.proposalA ?? conflict.a ?? conflict.left ?? listed[0] ?? "",
	).trim();
	const right = String(
		conflict.proposalB ?? conflict.b ?? conflict.right ?? listed[1] ?? "",
	).trim();
	return left && right ? [left, right] : undefined;
}

export function normalizeConflicts(
	conflicts: unknown,
): Array<[string, string]> {
	if (!Array.isArray(conflicts)) return [];
	const result = new Set<string>();
	for (const conflict of conflicts) {
		const pair = conflictPair(conflict);
		if (!pair) continue;
		const [left, right] = pair;
		if (left === right) continue;
		const sorted = [left, right].sort((a, b) => a.localeCompare(b));
		result.add(`${sorted[0]}\0${sorted[1]}`);
	}
	return [...result].map((value) => value.split("\0") as [string, string]);
}

export function tallyVotes(
	memberCount: number,
	proposalIds: string[],
	votes: VoteRecord[],
): {
	acceptedProposalIds: string[];
	yesByProposal: Record<string, number>;
	valid: boolean;
} {
	const voterIds = new Set(
		memberRoster(validateMemberCount(memberCount)).map((member) => member.id),
	);
	const proposals = new Set(proposalIds);
	const seen = new Set<string>();
	const yesByProposal: Record<string, number> = {};
	for (const proposalId of proposalIds) yesByProposal[proposalId] = 0;
	for (const vote of votes) {
		const key = `${vote.memberId}\0${vote.proposalId}`;
		if (
			!voterIds.has(vote.memberId) ||
			!proposals.has(vote.proposalId) ||
			seen.has(key) ||
			(vote.vote !== "YES" && vote.vote !== "NO")
		)
			return { acceptedProposalIds: [], yesByProposal, valid: false };
		seen.add(key);
		if (vote.vote === "YES")
			yesByProposal[vote.proposalId] =
				(yesByProposal[vote.proposalId] ?? 0) + 1;
	}
	const complete = seen.size === voterIds.size * proposals.size;
	const threshold = strictMajority(memberCount);
	return {
		acceptedProposalIds: complete
			? proposalIds.filter((id) => (yesByProposal[id] ?? 0) >= threshold)
			: [],
		yesByProposal,
		valid: complete,
	};
}

function manifestStatus(value: Partial<CouncilManifest>): CouncilStatus {
	if (
		value.status === "CONSENSUS" ||
		value.status === "NO_CONSENSUS" ||
		value.status === "UNRESOLVED_CONFLICT" ||
		value.status === "INCOMPLETE"
	)
		return value.status;
	throw new Error(
		`Council manifest status must be exactly one of CONSENSUS, NO_CONSENSUS, UNRESOLVED_CONFLICT, or INCOMPLETE at top-level manifest.status. Received ${JSON.stringify(value.status ?? null)}. Use CONSENSUS when at least one proposal was accepted by strict majority and no two accepted proposals remain in conflict. Use NO_CONSENSUS when no proposal was accepted. Use UNRESOLVED_CONFLICT when two accepted proposals remain in conflict after reconciliation. Use INCOMPLETE when a seat exhausted its replacements. A nested outcome.status field is never read.`,
	);
}

function validateBasicManifest(value: Partial<CouncilManifest>): {
	memberCount: 3 | 5 | 7;
	ids: Set<string>;
} {
	const memberCount = validateMemberCount(value.memberCount);
	if (
		typeof value.runId !== "string" ||
		!value.runId ||
		typeof value.question !== "string" ||
		!value.question.trim()
	)
		throw new Error("Council manifest requires runId and question.");
	if (!Array.isArray(value.members) || value.members.length !== memberCount)
		throw new Error("Council manifest member roster is incomplete.");
	const ids = new Set(value.members.map((member) => member.id));
	const expected = new Set(
		memberRoster(memberCount).map((member) => member.id),
	);
	if (ids.size !== memberCount || [...ids].some((id) => !expected.has(id)))
		throw new Error(
			`Council manifest members[].id must use the seat IDs ${[...expected].join(", ")}. Received ${JSON.stringify([...ids])}. Name the field id, not seatId or memberId, and give each member exactly { id, name, bias, model, attempt, finalStance }.`,
		);
	if (!Array.isArray(value.proposals) || value.proposals.length === 0)
		throw new Error("Council manifest must contain at least one proposal.");
	if (!Array.isArray(value.votes))
		throw new Error("Council manifest must contain votes.");
	if (!Array.isArray(value.acceptedProposalIds))
		throw new Error("Council manifest must contain accepted proposal IDs.");
	return { memberCount, ids };
}

function validateSuccessfulPhases(
	value: Partial<CouncilManifest>,
	memberCount: 3 | 5 | 7,
	ids: Set<string>,
): void {
	if (!Array.isArray(value.readiness) || value.readiness.length !== memberCount)
		throw new Error("Council manifest readiness barrier is incomplete.");
	if (
		value.readiness.some(
			(record) => !record.readyToVote || !ids.has(record.memberId),
		)
	)
		throw new Error(
			`Every current member must be ready before voting, and every readiness record must use memberId, not seatId. Received readiness member fields ${JSON.stringify(value.readiness.map((record) => record.memberId ?? null))}. Each record must be { memberId, attempt, supports, opposes, conflicts, statement, readyToVote: true }.`,
		);
	if (!Array.isArray(value.research))
		throw new Error("Council manifest must contain research records.");
	const researchByMember = new Map<string, number>();
	for (const record of value.research)
		researchByMember.set(
			record.memberId,
			(researchByMember.get(record.memberId) ?? 0) + 1,
		);
	if (
		memberRoster(memberCount).some(
			(member) => researchByMember.get(member.id) !== 2,
		)
	)
		throw new Error(
			`Every successful member must have exactly two flat research records keyed by memberId, not seatId. Counted ${JSON.stringify(Object.fromEntries(researchByMember))} against seats ${memberRoster(
				memberCount,
			)
				.map((member) => member.id)
				.join(
					", ",
				)}. Each record must be { memberId, researcherId, assignment, summary, confidence }.`,
		);
}

function validateProposalsAndVotes(
	value: Partial<CouncilManifest>,
	memberCount: 3 | 5 | 7,
	ids: Set<string>,
): Set<string> {
	if (
		!Array.isArray(value.proposals) ||
		!Array.isArray(value.votes) ||
		!Array.isArray(value.acceptedProposalIds)
	)
		throw new Error("Council manifest proposal phase is incomplete.");
	const proposalIds = value.proposals.map((proposal) => proposal.id);
	if (
		new Set(proposalIds).size !== proposalIds.length ||
		value.proposals.some(
			(proposal) =>
				!proposal.id || !proposal.text || !ids.has(proposal.authorId),
		)
	)
		throw new Error(
			`Council manifest proposals must be unique records of { id, authorId, text } where authorId is a seat ID. Received ${JSON.stringify(value.proposals.map((proposal) => ({ id: proposal.id ?? null, authorId: proposal.authorId ?? null })))}.`,
		);
	const tally = tallyVotes(memberCount, proposalIds, value.votes);
	if (!tally.valid)
		throw new Error(
			`Council manifest votes must be a flat array with exactly one record per member per proposal: ${memberCount} members times ${proposalIds.length} proposals equals ${memberCount * proposalIds.length} records, each { memberId, attempt, proposalId, vote: "YES" | "NO", rationale }. Do not nest ballots inside a per-seat object and do not use seatId. Received ${value.votes.length} records.`,
		);
	const accepted = [...value.acceptedProposalIds].sort((a, b) =>
		a.localeCompare(b),
	);
	const computed = [...tally.acceptedProposalIds].sort((a, b) =>
		a.localeCompare(b),
	);
	if (JSON.stringify(accepted) !== JSON.stringify(computed))
		throw new Error(
			`Accepted proposal IDs do not match the machine-computed tally. Manifest claims ${JSON.stringify(accepted)}; the tally at threshold ${strictMajority(memberCount)} accepts ${JSON.stringify(computed)}.`,
		);
	return new Set(value.acceptedProposalIds);
}

function validateOutcome(
	value: Partial<CouncilManifest>,
	accepted: Set<string>,
): void {
	const conflicts = normalizeConflicts(value.conflicts ?? []);
	const hasAcceptedConflict = conflicts.some(
		([left, right]) => accepted.has(left) && accepted.has(right),
	);
	if (
		value.status === "CONSENSUS" &&
		(accepted.size === 0 || hasAcceptedConflict)
	)
		throw new Error(
			"Consensus must contain accepted proposals with no declared conflict.",
		);
	if (value.status === "NO_CONSENSUS" && accepted.size !== 0)
		throw new Error("No consensus cannot contain accepted proposals.");
	if (value.status === "UNRESOLVED_CONFLICT" && !hasAcceptedConflict)
		throw new Error("Unresolved conflict requires an accepted conflict edge.");
}

const REQUIRED_MANIFEST_KEYS = [
	"version",
	"runId",
	"createdAt",
	"question",
	"memberCount",
	"status",
	"members",
	"research",
	"proposals",
	"readiness",
	"votes",
	"acceptedProposalIds",
	"conflicts",
	"reconciliationRounds",
	"report",
] as const;

const MANIFEST_SHAPE = [
	"Required manifest shape, all fields at top level with no nested outcome, roster, or protocol object:",
	"version: number, runId: string, createdAt: number, question: string, memberCount: 3 | 5 | 7,",
	"status: CONSENSUS | NO_CONSENSUS | UNRESOLVED_CONFLICT | INCOMPLETE,",
	"members: [{ id, name, bias, model, attempt, finalStance }],",
	"research: [{ memberId, researcherId, assignment, summary, confidence }] with exactly two entries per member,",
	"proposals: [{ id, authorId, text }],",
	"readiness: [{ memberId, attempt, supports, opposes, conflicts, statement, readyToVote }],",
	"votes: [{ memberId, attempt, proposalId, vote: YES | NO, rationale }] with one entry per member per proposal,",
	"acceptedProposalIds: string[], conflicts: [proposalId, proposalId][], reconciliationRounds: number, report: string.",
	"Optional: chairmanModel, researcherModel, modelWarning.",
].join(" ");

function validateManifestShape(value: Partial<CouncilManifest>): void {
	const missing = REQUIRED_MANIFEST_KEYS.filter(
		(key) => (value as Record<string, unknown>)[key] === undefined,
	);
	if (missing.length === 0) return;
	throw new Error(
		`Council manifest is missing required top-level fields: ${missing.join(", ")}. ${MANIFEST_SHAPE}`,
	);
}

export function validateManifest(manifest: unknown): CouncilManifest {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
		throw new Error("Council manifest must be an object.");
	const value = manifest as Partial<CouncilManifest>;
	validateManifestShape(value);
	const status = manifestStatus(value);
	const { memberCount, ids } = validateBasicManifest(value);
	if (status !== "INCOMPLETE")
		validateSuccessfulPhases(value, memberCount, ids);
	if (status !== "INCOMPLETE")
		validateOutcome(value, validateProposalsAndVotes(value, memberCount, ids));
	return value as CouncilManifest;
}

function manifestPath(runId: string): string {
	if (!/^council-[a-z0-9-]+$/.test(runId))
		throw new Error("Invalid council run ID.");
	return pathing.join(COUNCIL_STATE_DIR, `${runId}.json`);
}

const CHECKPOINT_KEYS = [
	"version",
	"runId",
	"createdAt",
	"question",
	"memberCount",
	"status",
	"chairmanModel",
	"researcherModel",
	"modelWarning",
	"members",
	"research",
	"proposals",
	"readiness",
	"votes",
	"acceptedProposalIds",
	"conflicts",
	"reconciliationRounds",
	"report",
] as const;

function checkpointPath(runId: string): string {
	if (!/^council-[a-z0-9-]+$/.test(runId))
		throw new Error("Invalid council run ID.");
	return pathing.join(COUNCIL_STATE_DIR, `${runId}.checkpoint.json`);
}

/** Keep only known manifest sections so a checkpoint can never smuggle unrelated state. */
export function checkpointPatch(value: unknown): Partial<CouncilManifest> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(
			"Council checkpoint must be a partial manifest object with known sections.",
		);
	const source = value as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	for (const key of CHECKPOINT_KEYS)
		if (source[key] !== undefined) patch[key] = source[key];
	if (Object.keys(patch).length === 0)
		throw new Error(
			`Council checkpoint contained no known sections. Use any of: ${CHECKPOINT_KEYS.join(", ")}.`,
		);
	return patch as Partial<CouncilManifest>;
}

/** Merge a phase artifact into the run's durable checkpoint so a dead chairman loses nothing. */
export function writeCheckpoint(
	runId: string,
	patch: Partial<CouncilManifest>,
): Partial<CouncilManifest> {
	const merged = { ...(loadCheckpoint(runId) ?? {}), ...patch, runId };
	filesystem.mkdirSync(COUNCIL_STATE_DIR, { recursive: true, mode: "0700" });
	const filePath = checkpointPath(runId);
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	filesystem.writeFileSync(
		temporaryPath,
		`${JSON.stringify(merged, null, 2)}\n`,
		{ mode: 0o600 },
	);
	filesystem.renameSync(temporaryPath, filePath);
	return merged;
}

export function loadCheckpoint(
	runId: string,
): Partial<CouncilManifest> | undefined {
	try {
		return JSON.parse(
			filesystem.readFileSync(checkpointPath(runId), "utf8"),
		) as Partial<CouncilManifest>;
	} catch {
		return undefined;
	}
}

export function clearCheckpoint(runId: string): void {
	try {
		filesystem.rmSync(checkpointPath(runId), { force: true });
	} catch {
		// Checkpoint cleanup is best effort; the published manifest is authoritative.
	}
}

function salvageReport(
	manifest: CouncilManifest,
	tallyLines: string[],
): string {
	return [
		`COUNCIL RECORD - run ${manifest.runId} (salvaged)`,
		`Question: ${manifest.question}`,
		"",
		"The chairman ended before publishing, so this record was assembled by the council extension from the phase checkpoints it had already written. No prose report was authored by the chairman.",
		"",
		`Seats: ${manifest.members.map((member) => `${member.id} ${member.name} (${member.model}, attempt ${member.attempt})`).join("; ")}`,
		`Research records: ${manifest.research.length}. Proposals: ${manifest.proposals.length}. Readiness records: ${manifest.readiness.length}. Votes: ${manifest.votes.length}. Reconciliation rounds: ${manifest.reconciliationRounds}.`,
		"",
		"MACHINE-COMPUTED RESULT",
		...tallyLines,
		`Status: ${manifest.status}. Accepted: ${manifest.acceptedProposalIds.join(", ") || "none"}.`,
	].join("\n");
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.flatMap((entry) =>
				typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
			)
		: [];
}

function salvageProposals(value: unknown): Proposal[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const proposal = entry as Record<string, unknown>;
		const id = String(proposal.id ?? "").trim();
		const authorId = String(
			proposal.authorId ?? proposal.sponsorMemberId ?? proposal.memberId ?? "",
		).trim();
		const text = String(
			proposal.text ?? proposal.thesis ?? proposal.body ?? proposal.title ?? "",
		).trim();
		return id && authorId && text ? [{ id, authorId, text }] : [];
	});
}

function salvageResearch(value: unknown): ResearchRecord[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry, index) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const memberId = String(record.memberId ?? "").trim();
		const summary = String(record.summary ?? "").trim();
		if (!memberId || !summary) return [];
		const researcher = String(record.researcher ?? index + 1).trim();
		return [
			{
				memberId,
				researcherId: String(
					record.researcherId ?? `${memberId}-${researcher}`,
				),
				assignment: String(record.assignment ?? record.brief ?? "research"),
				summary,
				...(Array.isArray(record.sources)
					? { sources: stringArray(record.sources) }
					: undefined),
				...(record.confidence
					? { confidence: String(record.confidence) }
					: undefined),
			},
		];
	});
}

function salvageReadiness(value: unknown): ReadinessRecord[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const memberId = String(record.memberId ?? "").trim();
		if (!memberId) return [];
		return [
			{
				memberId,
				attempt: typeof record.attempt === "number" ? record.attempt : 1,
				supports: stringArray(record.supports ?? record.for),
				opposes: stringArray(record.opposes ?? record.against),
				conflicts: normalizeConflicts(record.conflicts),
				statement: String(
					record.statement ?? record.readinessStatement ?? "Ready to vote.",
				),
				readyToVote: record.readyToVote === true,
			},
		];
	});
}

function salvageVotes(value: unknown, members: CouncilMember[]): VoteRecord[] {
	if (!Array.isArray(value)) return [];
	const attempts = new Map(
		members.map((member) => [member.id, member.attempt ?? 1]),
	);
	return value.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const memberId = String(record.memberId ?? "").trim();
		const proposalId = String(record.proposalId ?? "").trim();
		const vote = record.vote;
		if (!memberId || !proposalId || (vote !== "YES" && vote !== "NO"))
			return [];
		return [
			{
				memberId,
				attempt:
					typeof record.attempt === "number"
						? record.attempt
						: (attempts.get(memberId) ?? 1),
				proposalId,
				vote,
				...(record.rationale
					? { rationale: String(record.rationale) }
					: undefined),
			},
		];
	});
}

/**
 * Assemble a valid manifest from checkpoints when the chairman died before publishing.
 * The outcome is recomputed here rather than trusted, and the record is marked salvaged.
 */
export function salvageManifest(runId: string): CouncilManifest | undefined {
	const checkpoint = loadCheckpoint(runId);
	if (!checkpoint) return undefined;
	const memberCount = checkpoint.members?.length;
	if (memberCount !== 3 && memberCount !== 5 && memberCount !== 7)
		return undefined;
	const members = checkpoint.members ?? [];
	const proposals = salvageProposals(checkpoint.proposals);
	const votes = salvageVotes(checkpoint.votes, members);
	if (proposals.length === 0 || votes.length === 0) return undefined;
	const tally = tallyVotes(
		memberCount,
		proposals.map((proposal) => proposal.id),
		votes,
	);
	if (!tally.valid) return undefined;
	const accepted = new Set(tally.acceptedProposalIds);
	const conflicts = normalizeConflicts(checkpoint.conflicts ?? []);
	const hasAcceptedConflict = conflicts.some(
		([left, right]) => accepted.has(left) && accepted.has(right),
	);
	const status: CouncilStatus =
		accepted.size === 0
			? "NO_CONSENSUS"
			: hasAcceptedConflict
				? "UNRESOLVED_CONFLICT"
				: "CONSENSUS";
	const rawConflicts = checkpoint.conflicts as unknown;
	const inferredReconciliation =
		Array.isArray(rawConflicts) &&
		rawConflicts.some(
			(conflict) =>
				!!conflict && typeof conflict === "object" && "resolved" in conflict,
		);
	const createdAt =
		typeof checkpoint.createdAt === "number"
			? checkpoint.createdAt
			: Date.parse(String(checkpoint.createdAt ?? ""));
	const manifest: CouncilManifest = {
		version: 1,
		runId,
		createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
		question: checkpoint.question ?? "Question unavailable in checkpoints.",
		memberCount,
		status,
		...(checkpoint.chairmanModel
			? { chairmanModel: checkpoint.chairmanModel }
			: undefined),
		...(checkpoint.researcherModel
			? { researcherModel: checkpoint.researcherModel }
			: undefined),
		...(checkpoint.modelWarning
			? { modelWarning: checkpoint.modelWarning }
			: undefined),
		members,
		research: salvageResearch(checkpoint.research),
		proposals,
		readiness: salvageReadiness(checkpoint.readiness),
		votes,
		acceptedProposalIds: [...tally.acceptedProposalIds],
		conflicts,
		reconciliationRounds:
			typeof checkpoint.reconciliationRounds === "number"
				? checkpoint.reconciliationRounds
				: inferredReconciliation
					? 1
					: 0,
		report: "",
		salvaged: true,
	};
	manifest.report = salvageReport(
		manifest,
		proposals.map((proposal) => {
			const yes = tally.yesByProposal[proposal.id] ?? 0;
			return `${proposal.id}: ${yes} YES, ${memberCount - yes} NO - ${accepted.has(proposal.id) ? "accepted" : "rejected"}.`;
		}),
	);
	try {
		return validateManifest(manifest);
	} catch {
		return undefined;
	}
}

export function writeManifest(manifest: CouncilManifest): void {
	filesystem.mkdirSync(COUNCIL_STATE_DIR, { recursive: true, mode: "0700" });
	const filePath = manifestPath(manifest.runId);
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	filesystem.writeFileSync(
		temporaryPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
		{
			mode: 0o600,
		},
	);
	filesystem.renameSync(temporaryPath, filePath);
}

export function loadManifest(runId: string): CouncilManifest | undefined {
	try {
		return validateManifest(
			JSON.parse(filesystem.readFileSync(manifestPath(runId), "utf8")),
		);
	} catch {
		return undefined;
	}
}

export function listManifests(): CouncilManifest[] {
	try {
		return filesystem.readdirSync(COUNCIL_STATE_DIR).flatMap((name) => {
			if (
				!name.endsWith(".json") ||
				name.endsWith(".progress.json") ||
				name.endsWith(".debate.json")
			)
				return [];
			const manifest = loadManifest(name.slice(0, -5));
			return manifest ? [manifest] : [];
		});
	} catch {
		return [];
	}
}

function debatePath(runId: string): string {
	if (!/^council-[a-z0-9-]+$/.test(runId))
		throw new Error("Invalid council run ID.");
	return pathing.join(COUNCIL_STATE_DIR, `${runId}.debate.json`);
}

function isDebatePhase(value: unknown): value is CouncilDebatePhase {
	return (
		value === "alignment" ||
		value === "alignment-debate" ||
		value === "voting" ||
		value === "reconciliation"
	);
}

function sanitizeDebateStatement(
	value: CouncilDebateStatement,
): CouncilDebateStatement | undefined {
	const memberId = String(value.memberId ?? "").toUpperCase();
	const text = String(value.text ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 800);
	const kinds = ["argument", "challenge", "response", "vote", "dissent"];
	if (
		!value.id ||
		!/^C[1-7]$/.test(memberId) ||
		!isDebatePhase(value.phase) ||
		!kinds.includes(value.kind) ||
		!text
	)
		return undefined;
	return {
		id: String(value.id).slice(0, 160),
		phase: value.phase,
		memberId,
		memberName: String(value.memberName || memberId).slice(0, 40),
		kind: value.kind,
		text,
		recordedAt: Number.isFinite(value.recordedAt)
			? Math.max(0, Math.trunc(value.recordedAt))
			: Date.now(),
		...(value.proposalId
			? { proposalId: String(value.proposalId).slice(0, 40) }
			: undefined),
		...(value.targetMemberId && /^C[1-7]$/i.test(value.targetMemberId)
			? { targetMemberId: value.targetMemberId.toUpperCase() }
			: undefined),
		...(value.vote === "YES" || value.vote === "NO"
			? { vote: value.vote }
			: undefined),
	};
}

export function writeDebateStatements(
	runId: string,
	statements: CouncilDebateStatement[],
): CouncilDebateTranscript {
	const existing = loadDebateTranscript(runId);
	const merged = new Map(
		(existing?.statements ?? []).map((statement) => [statement.id, statement]),
	);
	for (const raw of statements) {
		const statement = sanitizeDebateStatement(raw);
		if (statement) merged.set(statement.id, statement);
	}
	const transcript: CouncilDebateTranscript = {
		version: 1,
		runId,
		updatedAt: Date.now(),
		statements: [...merged.values()].sort(
			(left, right) =>
				left.recordedAt - right.recordedAt || left.id.localeCompare(right.id),
		),
	};
	filesystem.mkdirSync(COUNCIL_STATE_DIR, { recursive: true, mode: "0700" });
	const filePath = debatePath(runId);
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	filesystem.writeFileSync(
		temporaryPath,
		`${JSON.stringify(transcript, null, 2)}\n`,
		{ mode: 0o600 },
	);
	filesystem.renameSync(temporaryPath, filePath);
	return transcript;
}

export function loadDebateTranscript(
	runId: string,
): CouncilDebateTranscript | undefined {
	try {
		const value = JSON.parse(
			filesystem.readFileSync(debatePath(runId), "utf8"),
		) as CouncilDebateTranscript;
		if (
			value.version !== 1 ||
			value.runId !== runId ||
			!Array.isArray(value.statements)
		)
			return undefined;
		return {
			...value,
			statements: value.statements.flatMap((statement) => {
				const clean = sanitizeDebateStatement(statement);
				return clean ? [clean] : [];
			}),
		};
	} catch {
		return undefined;
	}
}

export function listDebateTranscripts(): CouncilDebateTranscript[] {
	try {
		return filesystem
			.readdirSync(COUNCIL_STATE_DIR)
			.flatMap((name) => {
				if (!name.endsWith(".debate.json")) return [];
				const transcript = loadDebateTranscript(name.slice(0, -12));
				return transcript ? [transcript] : [];
			})
			.sort((left, right) => right.updatedAt - left.updatedAt);
	} catch {
		return [];
	}
}

function progressPath(runId: string): string {
	if (!/^council-[a-z0-9-]+$/.test(runId))
		throw new Error("Invalid council run ID.");
	return pathing.join(COUNCIL_STATE_DIR, `${runId}.progress.json`);
}

function isProgressPhase(value: unknown): value is CouncilProgressPhase {
	return (
		value === "starting" ||
		value === "member-research" ||
		value === "proposals" ||
		value === "alignment" ||
		value === "voting" ||
		value === "reconciliation" ||
		value === "publishing" ||
		value === "complete" ||
		value === "failed"
	);
}

const SEAT_ACTIVITIES: readonly CouncilSeatActivity[] = [
	"seated",
	"briefing",
	"researching",
	"research-complete",
	"drafting",
	"proposed",
	"aligning",
	"ready",
	"voted-yes",
	"voted-no",
	"reconciling",
	"replaced",
	"stalled",
	"failed",
];

export function sanitizeSeats(value: unknown): CouncilSeatState[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const seen = new Set<string>();
	const seats = value.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const seat = entry as Partial<CouncilSeatState>;
		const memberId = String(seat.memberId ?? "").toUpperCase();
		if (!/^C[1-7]$/.test(memberId) || seen.has(memberId)) return [];
		if (!SEAT_ACTIVITIES.includes(seat.activity as CouncilSeatActivity))
			return [];
		seen.add(memberId);
		const pending = Number(seat.researchersPending);
		return [
			{
				memberId,
				activity: seat.activity as CouncilSeatActivity,
				...(seat.detail
					? { detail: String(seat.detail).slice(0, 12) }
					: undefined),
				...(Number.isFinite(pending) && pending >= 0 && pending <= 2
					? { researchersPending: Math.trunc(pending) }
					: undefined),
			},
		];
	});
	return seats.length > 0 ? seats : undefined;
}

export function sanitizeFocus(value: unknown): CouncilFocus | undefined {
	if (!value || typeof value !== "object") return undefined;
	const focus = value as Partial<CouncilFocus>;
	const proposalId = String(focus.proposalId ?? "").trim();
	if (!/^P(?:[0-9]{1,2}|-C[1-7])$/i.test(proposalId)) return undefined;
	const yes = Number(focus.yes);
	const no = Number(focus.no);
	return {
		proposalId: proposalId.toUpperCase(),
		title: String(focus.title ?? "").slice(0, 120),
		...(Number.isFinite(yes) && yes >= 0
			? { yes: Math.trunc(yes) }
			: undefined),
		...(Number.isFinite(no) && no >= 0 ? { no: Math.trunc(no) } : undefined),
	};
}

export function writeProgress(progress: CouncilProgress): void {
	if (
		!isProgressPhase(progress.phase) ||
		(progress.status !== "RUNNING" &&
			progress.status !== "COMPLETE" &&
			progress.status !== "FAILED")
	)
		throw new Error("Invalid council progress update.");
	const record: CouncilProgress = {
		...progress,
		seats: sanitizeSeats(progress.seats),
		focus: sanitizeFocus(progress.focus),
	};
	filesystem.mkdirSync(COUNCIL_STATE_DIR, { recursive: true, mode: "0700" });
	const filePath = progressPath(progress.runId);
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	filesystem.writeFileSync(
		temporaryPath,
		`${JSON.stringify(record, null, 2)}\n`,
		{ mode: 0o600 },
	);
	filesystem.renameSync(temporaryPath, filePath);
}

export function loadProgress(runId: string): CouncilProgress | undefined {
	try {
		const value = JSON.parse(
			filesystem.readFileSync(progressPath(runId), "utf8"),
		) as CouncilProgress;
		return isProgressPhase(value.phase) &&
			(value.status === "RUNNING" ||
				value.status === "COMPLETE" ||
				value.status === "FAILED")
			? {
					...value,
					seats: sanitizeSeats(value.seats),
					focus: sanitizeFocus(value.focus),
				}
			: undefined;
	} catch {
		return undefined;
	}
}

export function listProgress(): CouncilProgress[] {
	try {
		return filesystem
			.readdirSync(COUNCIL_STATE_DIR)
			.flatMap((name) => {
				if (!name.endsWith(".progress.json")) return [];
				const progress = loadProgress(name.slice(0, -14));
				return progress ? [progress] : [];
			})
			.sort((left, right) => right.updatedAt - left.updatedAt);
	} catch {
		return [];
	}
}
