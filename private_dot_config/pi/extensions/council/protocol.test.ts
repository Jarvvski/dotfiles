import { strict as assert } from "node:assert";
// @ts-expect-error Bun provides this module at test runtime.
import { test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateResearchDispatch } from "./member-guard.ts";
import { decodeManifestArgument } from "./chairman-tools.ts";
import {
	CouncilChamberAnimation,
	councilVisualState,
	renderCouncilChamber,
} from "./animation.ts";
import {
	readCouncilDebateStatements,
	readCouncilFleet,
	readCouncilRunPulse,
} from "./fleet.ts";
import {
	COUNCIL_STATE_DIR,
	loadDebateTranscript,
	memberRoster,
	normalizeConflicts,
	shortTopic,
	strictMajority,
	tallyVotes,
	validateManifest,
	checkpointPatch,
	clearCheckpoint,
	loadCheckpoint,
	salvageManifest,
	sanitizeFocus,
	sanitizeSeats,
	writeCheckpoint,
	writeDebateStatements,
	type CouncilDebateStatement,
	type CouncilManifest,
	type CouncilProgress,
} from "./protocol.ts";

function validManifest(memberCount: 3 | 5 | 7): CouncilManifest {
	const members = memberRoster(memberCount).map((member) => ({
		...member,
		model: "openai/test",
		attempt: 1,
		finalStance: "supports P1",
	}));
	const research = members.flatMap((member) =>
		[1, 2].map((index) => ({
			memberId: member.id,
			researcherId: `${member.id}-R${index}`,
			assignment: "evidence",
			summary: "evidence",
			confidence: "medium",
		})),
	);
	const readiness = members.map((member) => ({
		memberId: member.id,
		attempt: 1,
		supports: ["P1"],
		opposes: [],
		conflicts: [],
		statement: "ready",
		readyToVote: true,
	}));
	const votes = members.map((member) => ({
		memberId: member.id,
		attempt: 1,
		proposalId: "P1",
		vote: "YES" as const,
		rationale: "supports",
	}));
	return {
		version: 1,
		runId: "council-test",
		createdAt: Date.now(),
		question: "Should we choose P1?",
		memberCount,
		status: "CONSENSUS" as const,
		members,
		research,
		proposals: [{ id: "P1", authorId: "C1", text: "Choose P1" }],
		readiness,
		votes,
		acceptedProposalIds: ["P1"],
		conflicts: [],
		reconciliationRounds: 0,
		report: "Consensus on P1.",
	};
}

test("council animation maps phases and respects terminal width", () => {
	const phases = [
		"starting",
		"member-research",
		"proposals",
		"alignment",
		"voting",
		"reconciliation",
		"publishing",
		"complete",
		"failed",
	] as const;
	const theme = { fg: (_color: string, text: string) => text } as never;
	const progress: CouncilProgress = {
		version: 1,
		runId: "council-animation-test",
		updatedAt: Date.now(),
		phase: "member-research",
		message: "C2 is consulting the archive.",
		completed: 2,
		total: 5,
		status: "RUNNING",
	};
	for (const seatCount of [3, 5, 7] as const) {
		const lines = renderCouncilChamber(
			{ ...progress, total: seatCount },
			seatCount,
			5,
			Date.now() - 1_000,
			Date.now(),
			72,
			theme,
		);
		assert.deepEqual(
			[...new Set(lines.map((line) => visibleWidth(line)))],
			[72],
		);
	}
	for (const phase of phases) {
		const visual = councilVisualState(phase, 3);
		assert.equal(visual.lines.length, 3);
		assert.ok(visual.seal.length > 0);
		const full = renderCouncilChamber(
			{ ...progress, phase },
			5,
			3,
			Date.now() - 12_000,
			Date.now(),
			100,
			theme,
		);
		assert.deepEqual(
			[...new Set(full.map((line) => visibleWidth(line)))],
			[100],
		);
		const compact = renderCouncilChamber(
			{ ...progress, phase },
			5,
			3,
			Date.now() - 12_000,
			Date.now(),
			40,
			theme,
		);
		assert.ok(compact.every((line) => visibleWidth(line) <= 40));
	}
	const stale = renderCouncilChamber(
		{ ...progress, updatedAt: Date.now() - 16_000 },
		5,
		0,
		Date.now() - 20_000,
		Date.now(),
		100,
		theme,
	).join("\n");
	assert.match(stale, /WAITING FOR A RUNTIME SIGNAL/);
	assert.match(stale, /WAITING · chairman working · signal 16s ago/);
});

test("council animation renders reported seat states and the proposal on the floor", () => {
	const theme = { fg: (_color: string, text: string) => text } as never;
	const progress: CouncilProgress = {
		version: 1,
		runId: "council-seat-test",
		updatedAt: Date.now(),
		phase: "voting",
		message: "Ballot open on P2.",
		completed: 3,
		total: 5,
		status: "RUNNING",
		seats: [
			{ memberId: "C1", activity: "voted-yes", detail: "P-C1" },
			{ memberId: "C2", activity: "voted-no", detail: "P-C1" },
			{ memberId: "C3", activity: "researching", researchersPending: 1 },
			{ memberId: "C4", activity: "ready" },
			{ memberId: "C5", activity: "stalled" },
		],
		focus: {
			proposalId: "P-C1",
			title: "Adopt event sourcing",
			yes: 2,
			no: 1,
		},
	};
	const rendered = renderCouncilChamber(
		progress,
		5,
		4,
		Date.now() - 5_000,
		Date.now(),
		110,
		theme,
	);
	const text = rendered.join("\n");
	assert.ok(rendered.every((line) => visibleWidth(line) <= 110));
	assert.match(text, /Atlas · YES own/);
	assert.match(text, /Forge · NO Atlas/);
	assert.match(text, /Cassandra · 1\/2 research/);
	assert.match(text, /Hearth · ready/);
	assert.match(text, /Horizon · wait/);
	assert.match(text, /FLOOR Atlas proposal "Adopt event sourcing"/);
	assert.doesNotMatch(text, /P-C1/);
	assert.match(text, /YES 2 \| NO 1 \(needs 3\)/);
	const compact = renderCouncilChamber(
		progress,
		5,
		4,
		Date.now() - 5_000,
		Date.now(),
		50,
		theme,
	);
	assert.equal(compact.length, 2);
	assert.ok(compact.every((line) => visibleWidth(line) <= 50));
	assert.equal(
		sanitizeSeats([{ memberId: "c9", activity: "ready" }]),
		undefined,
	);
	assert.equal(
		sanitizeSeats([{ memberId: "C1", activity: "napping" }]),
		undefined,
	);
	assert.deepEqual(
		sanitizeSeats([
			{ memberId: "c2", activity: "ready" },
			{ memberId: "C2", activity: "seated" },
		]),
		[{ memberId: "C2", activity: "ready" }],
	);
	assert.equal(sanitizeFocus({ proposalId: "nope", title: "x" }), undefined);
	assert.deepEqual(
		sanitizeFocus({ proposalId: "p3", title: "Ship it", yes: 4 }),
		{
			proposalId: "P3",
			title: "Ship it",
			yes: 4,
		},
	);
	assert.deepEqual(
		sanitizeFocus({ proposalId: "p-c1", title: "Atlas proposal" }),
		{
			proposalId: "P-C1",
			title: "Atlas proposal",
		},
	);
});

test("council alignment explains proposal sponsorship without raw IDs", () => {
	const theme = { fg: (_color: string, text: string) => text } as never;
	const now = Date.now();
	const text = renderCouncilChamber(
		{
			version: 1,
			runId: "council-alignment-labels",
			updatedAt: now,
			phase: "alignment",
			message: "Aligning proposals.",
			completed: 0,
			total: 5,
			status: "RUNNING",
			seats: [
				{ memberId: "C1", activity: "aligning", detail: "P-C1" },
				{ memberId: "C2", activity: "aligning", detail: "P-C1" },
				{ memberId: "C3", activity: "aligning", detail: "P-C3" },
				{ memberId: "C4", activity: "aligning", detail: "P-C4" },
				{ memberId: "C5", activity: "aligning", detail: "P-C5" },
			],
		},
		5,
		2,
		now - 5_000,
		now,
		120,
		theme,
	).join("\n");
	assert.match(text, /Atlas · backs own/);
	assert.match(text, /Forge · backs Atlas/);
	assert.match(text, /Cassandra · backs own/);
	assert.doesNotMatch(text, /P-C[1-5]/);
});

test("council widget explains unanimous proposal approval", () => {
	const theme = { fg: (_color: string, text: string) => text } as never;
	const now = Date.now();
	const text = renderCouncilChamber(
		{
			version: 1,
			runId: "council-unanimous-label",
			updatedAt: now,
			phase: "publishing",
			message: "Preparing report.",
			completed: 5,
			total: 5,
			status: "RUNNING",
			seats: memberRoster(5).map((member) => ({
				memberId: member.id,
				activity: "voted-yes" as const,
				detail: "all 5",
			})),
		},
		5,
		2,
		now - 5_000,
		now,
		160,
		theme,
	).join("\n");
	assert.match(text, /Atlas · approved all 5 proposals/);
	assert.match(text, /Horizon · approved all 5 proposals/);
	assert.doesNotMatch(text, /C1 all 5/);
});

test("council debate ticker rotates attributable arguments", () => {
	const theme = { fg: (_color: string, text: string) => text } as never;
	const now = Date.now();
	const statements: CouncilDebateStatement[] = [
		{
			id: "alignment:C1:argument",
			phase: "alignment",
			memberId: "C1",
			memberName: "Atlas",
			kind: "argument",
			text: "The integration moat compounds too slowly for a unicorn outcome.",
			recordedAt: now,
		},
	];
	const text = renderCouncilChamber(
		{
			version: 1,
			runId: "council-debate-ticker",
			updatedAt: now,
			phase: "alignment",
			message: "Arguments arriving.",
			completed: 1,
			total: 5,
			status: "RUNNING",
		},
		5,
		0,
		now - 5_000,
		now,
		140,
		theme,
		undefined,
		undefined,
		statements,
	).join("\n");
	assert.match(text, /DEBATE 1\/1 · Atlas ARGUES/);
	assert.match(text, /integration moat compounds too slowly/);

	const voteText = renderCouncilChamber(
		{
			version: 1,
			runId: "council-debate-vote",
			updatedAt: now,
			phase: "voting",
			message: "Voting.",
			completed: 1,
			total: 5,
			status: "RUNNING",
		},
		5,
		0,
		now - 5_000,
		now,
		140,
		theme,
		undefined,
		undefined,
		[
			{
				...statements[0]!,
				id: "voting:C1:P-C1",
				phase: "voting",
				kind: "vote",
				proposalId: "P-C1",
				vote: "YES",
			},
		],
	).join("\n");
	assert.match(voteText, /Atlas YES on own proposal/);
});

test("council checkpoints survive a chairman that never publishes", () => {
	const runId = `council-test-salvage-${Date.now().toString(36)}`;
	try {
		assert.throws(() => checkpointPatch("not an object"), /partial manifest/);
		assert.throws(() => checkpointPatch({ nonsense: 1 }), /no known sections/);
		assert.equal(salvageManifest(runId), undefined);

		const source = validManifest(3);
		writeCheckpoint(runId, {
			version: 1,
			createdAt: source.createdAt,
			question: source.question,
			memberCount: 3,
			members: source.members,
		});
		writeCheckpoint(runId, { research: source.research });
		assert.equal(salvageManifest(runId), undefined);
		writeCheckpoint(runId, {
			proposals: source.proposals,
			readiness: source.readiness,
		});
		writeCheckpoint(
			runId,
			checkpointPatch({
				votes: source.votes,
				reconciliationRounds: 1,
				ignored: "dropped",
			}),
		);

		const checkpoint = loadCheckpoint(runId);
		assert.equal(checkpoint?.members?.length, 3);
		assert.equal(checkpoint?.votes?.length, 3);
		assert.equal((checkpoint as Record<string, unknown>).ignored, undefined);

		const salvaged = salvageManifest(runId);
		assert.equal(salvaged?.status, "CONSENSUS");
		assert.equal(salvaged?.salvaged, true);
		assert.deepEqual(salvaged?.acceptedProposalIds, ["P1"]);
		assert.equal(salvaged?.reconciliationRounds, 1);
		assert.match(salvaged?.report ?? "", /salvaged/);
		assert.match(salvaged?.report ?? "", /P1: 3 YES, 0 NO - accepted/);

		writeCheckpoint(runId, {
			proposals: [
				...source.proposals,
				{ id: "P2", authorId: "C2", text: "Choose P2" },
			],
			votes: [
				...source.votes,
				...source.members.map((member) => ({
					memberId: member.id,
					attempt: 1,
					proposalId: "P2",
					vote: "YES" as const,
					rationale: "supports",
				})),
			],
			conflicts: [["P1", "P2"]],
		});
		assert.equal(salvageManifest(runId)?.status, "UNRESOLVED_CONFLICT");
	} finally {
		clearCheckpoint(runId);
		assert.equal(loadCheckpoint(runId), undefined);
	}
});

test("council salvage normalizes rich chairman checkpoint records", () => {
	const runId = `council-test-rich-salvage-${Date.now().toString(36)}`;
	const source = validManifest(3);
	const richCheckpoint = {
		version: 1,
		createdAt: "2025-01-01T00:00:00Z",
		question: source.question,
		memberCount: 3,
		members: source.members,
		research: source.research.map((record, index) => ({
			memberId: record.memberId,
			researcher: index % 2 === 0 ? "A" : "B",
			brief: record.assignment,
			summary: record.summary,
		})),
		proposals: [
			{ id: "P1", sponsorMemberId: "C1", thesis: "Choose P1" },
			{ id: "P2", sponsorMemberId: "C2", thesis: "Choose P2" },
		],
		readiness: source.readiness.map((record) => ({
			memberId: record.memberId,
			attempt: record.attempt,
			for: ["P1", "P2"],
			against: [],
			statement: record.statement,
			readyToVote: true,
		})),
		votes: [
			...source.votes.map(({ attempt: _attempt, ...vote }) => vote),
			...source.members.map((member) => ({
				memberId: member.id,
				proposalId: "P2",
				vote: "YES" as const,
				rationale: "supports",
			})),
		],
		conflicts: [
			{
				proposalA: "P1",
				proposalB: "P2",
				resolved: false,
				reason: "still conflicts",
			},
			{
				for: ["P2", "P3"],
				resolved: true,
				reason: "resolved",
			},
		],
		reconciliationRounds: null,
	};
	try {
		writeCheckpoint(
			runId,
			richCheckpoint as unknown as Partial<CouncilManifest>,
		);
		const salvaged = salvageManifest(runId);
		assert.equal(salvaged?.status, "UNRESOLVED_CONFLICT");
		assert.deepEqual(salvaged?.conflicts, [["P1", "P2"]]);
		assert.equal(salvaged?.reconciliationRounds, 1);
		assert.deepEqual(
			salvaged?.proposals.map((proposal) => proposal.authorId),
			["C1", "C2"],
		);
		assert.ok(salvaged?.votes.every((vote) => vote.attempt >= 1));
	} finally {
		clearCheckpoint(runId);
	}
});

test("council participant outputs become a durable debate transcript", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-council-debate-"));
	const sessions = path.join(root, "sessions");
	const registryDir = path.join(root, "registry");
	const chairmanRunId = "chairman-debate-test";
	const runId = `council-test-debate-${Date.now().toString(36)}`;
	fs.mkdirSync(sessions, { recursive: true });
	fs.mkdirSync(registryDir, { recursive: true });
	const alignmentSession = path.join(sessions, "alignment.jsonl");
	const debateSession = path.join(sessions, "alignment-debate.jsonl");
	const votingSession = path.join(sessions, "voting.jsonl");
	const sessionMessage = (payload: Record<string, unknown>) =>
		`${JSON.stringify({
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "text",
						text: `${JSON.stringify(payload)}\n\n\`\`\`acceptance-report\n{}`,
					},
				],
			},
		})}\n`;
	fs.writeFileSync(
		alignmentSession,
		sessionMessage({
			phase: "alignment",
			memberId: "C1",
			name: "Atlas",
			publicArgument:
				"A vertical integration moat can be valuable without reaching unicorn scale.",
			challenges: [
				{
					targetMemberId: "C3",
					proposalId: "P-C3",
					text: "Calling the product a pure wrapper ignores its ERP write-path integration.",
				},
			],
		}),
	);
	fs.writeFileSync(
		debateSession,
		sessionMessage({
			phase: "alignment-debate",
			memberId: "C3",
			name: "Cassandra",
			publicArgument:
				"Integration depth does not eliminate platform absorption risk.",
			responses: [
				{
					targetMemberId: "C1",
					proposalId: "P-C1",
					claim: "ERP integration creates a durable moat.",
					text: "Incumbent ERP vendors retain control of the system of record.",
				},
			],
		}),
	);
	fs.writeFileSync(
		votingSession,
		sessionMessage({
			phase: "voting",
			memberId: "C2",
			name: "Forge",
			ballots: [
				{
					proposalId: "P-C1",
					vote: "YES",
					rationale:
						"The disclosed traction does not support the required revenue scale.",
				},
			],
		}),
	);
	fs.writeFileSync(
		path.join(registryDir, "registry.json"),
		JSON.stringify({
			updatedAt: Date.now(),
			children: [
				{
					id: "alignment-fanout",
					parentRunId: chairmanRunId,
					agent: "council-participant",
					startedAt: 1,
					steps: [{ status: "complete", sessionFile: alignmentSession }],
				},
				{
					id: "debate-fanout",
					parentRunId: chairmanRunId,
					agent: "council-participant",
					startedAt: 2,
					steps: [{ status: "complete", sessionFile: debateSession }],
				},
				{
					id: "voting-fanout",
					parentRunId: chairmanRunId,
					agent: "council-participant",
					startedAt: 3,
					steps: [{ status: "complete", sessionFile: votingSession }],
				},
			],
		}),
	);
	try {
		const statements = readCouncilDebateStatements(chairmanRunId, root);
		assert.equal(statements.length, 5);
		assert.deepEqual(
			statements.map((statement) => statement.kind),
			["argument", "challenge", "argument", "response", "vote"],
		);
		assert.equal(statements[1]?.targetMemberId, "C3");
		assert.equal(statements[3]?.targetMemberId, "C1");
		assert.equal(statements[4]?.proposalId, "P-C1");
		assert.equal(statements[4]?.vote, "YES");
		writeDebateStatements(runId, statements);
		writeDebateStatements(runId, statements);
		const transcript = loadDebateTranscript(runId);
		assert.equal(transcript?.statements.length, 5);
		assert.match(
			transcript?.statements[0]?.text ?? "",
			/vertical integration moat/,
		);
	} finally {
		fs.rmSync(path.join(COUNCIL_STATE_DIR, `${runId}.debate.json`), {
			force: true,
		});
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("council run pulse reports chairman activity", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-council-pulse-"));
	const chairmanRunId = "chairman-pulse-test";
	fs.mkdirSync(path.join(root, chairmanRunId), { recursive: true });
	fs.writeFileSync(
		path.join(root, chairmanRunId, "status.json"),
		JSON.stringify({
			state: "running",
			lastActivityAt: 12_000,
			lastUpdate: 11_000,
			steps: [{ status: "running", activityState: "active_long_running" }],
		}),
	);
	assert.deepEqual(readCouncilRunPulse(chairmanRunId, root), {
		updatedAt: 12_000,
		state: "running",
		activity: "active_long_running",
	});
	assert.equal(readCouncilRunPulse("missing-run", root), undefined);
	fs.rmSync(root, { recursive: true, force: true });
});

test("council fleet reader reports live seat and researcher activity", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-council-fleet-"));
	const chairmanRunId = "chairman-run-test";
	const memberRunId = "member-fanout";
	fs.mkdirSync(path.join(root, "run-a"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "run-a", "registry.json"),
		JSON.stringify({
			updatedAt: 5_000,
			children: [
				{
					id: memberRunId,
					parentRunId: chairmanRunId,
					agent: "council-member",
					state: "running",
					startedAt: 1_000,
					lastUpdate: 5_000,
					totalCost: { costUsd: 0.5 },
					steps: [
						{ status: "complete" },
						{ status: "complete" },
						{ status: "running" },
						{ status: "running" },
						{ status: "failed" },
					],
					children: [
						{
							parentRunId: memberRunId,
							parentStepIndex: 2,
							agent: "council-researcher",
							steps: [{ status: "complete" }, { status: "running" }],
						},
					],
				},
			],
		}),
	);
	const fleet = readCouncilFleet(chairmanRunId, root);
	assert.ok(fleet);
	assert.equal(fleet?.agent, "council-member");
	assert.equal(fleet?.complete, 2);
	assert.equal(fleet?.running, 2);
	assert.equal(fleet?.failed, 1);
	assert.equal(fleet?.researchersComplete, 1);
	assert.equal(fleet?.researchersTotal, 2);
	assert.equal(fleet?.costUsd, 0.5);
	assert.equal(readCouncilFleet("missing-run", root), undefined);

	const theme = { fg: (_color: string, text: string) => text } as never;
	const now = Date.now();
	const staleProgress: CouncilProgress = {
		version: 1,
		runId: "council-fleet-test",
		updatedAt: now - 120_000,
		phase: "member-research",
		message: "Member fanout launched.",
		completed: 0,
		total: 5,
		status: "RUNNING",
	};
	const live = { ...fleet!, updatedAt: now - 1_000 };
	const text = renderCouncilChamber(
		staleProgress,
		5,
		4,
		now - 200_000,
		now,
		110,
		theme,
		live,
	).join("\n");
	assert.match(text, /SEATS 2\/5 complete, 2 running/);
	assert.match(text, /RESEARCHERS 1\/2 complete, 1 running/);
	assert.match(text, /1 failed/);
	assert.match(text, /council-member fanout in flight/);
	assert.match(text, /LIVE · 2\/5 members complete, 2 working/);
	assert.doesNotMatch(text, /WAITING FOR A RUNTIME SIGNAL/);
	assert.match(text, /Cassandra · 1\/2 research/);
	assert.match(text, /Horizon · fail/);

	const dead = renderCouncilChamber(
		staleProgress,
		5,
		4,
		now - 200_000,
		now,
		110,
		theme,
		{ ...fleet!, updatedAt: now - 120_000 },
	).join("\n");
	assert.match(dead, /WAITING FOR A RUNTIME SIGNAL/);

	const completedFleet = {
		...fleet!,
		updatedAt: now - 120_000,
		seats: fleet!.seats.map((seat) => ({ ...seat, status: "complete" })),
		complete: 5,
		running: 0,
		failed: 0,
	};
	const processing = renderCouncilChamber(
		staleProgress,
		5,
		4,
		now - 200_000,
		now,
		110,
		theme,
		completedFleet,
		{ updatedAt: now - 2_000, state: "running" },
	).join("\n");
	assert.match(
		processing,
		/LIVE · chairman processing completed member fanout/,
	);
	assert.match(processing, /signal 2s ago/);
	assert.doesNotMatch(processing, /WAITING FOR A RUNTIME SIGNAL/);
	fs.rmSync(root, { recursive: true, force: true });
});

test("council animation cleanup is idempotent", () => {
	let setWidgetCalls = 0;
	const ctx = {
		hasUI: true,
		mode: "tui",
		ui: {
			setWidget: () => {
				setWidgetCalls += 1;
			},
		},
	} as never;
	const animation = new CouncilChamberAnimation(
		ctx,
		"council-animation-cleanup",
		3,
	);
	animation.start();
	animation.dispose();
	animation.dispose();
	assert.equal(setWidgetCalls, 2);
});

test("council runtime monitoring also starts without a TUI widget", () => {
	let setWidgetCalls = 0;
	const ctx = {
		hasUI: false,
		mode: "json",
		ui: {
			setWidget: () => {
				setWidgetCalls += 1;
			},
		},
	} as never;
	const animation = new CouncilChamberAnimation(
		ctx,
		"council-headless-monitor",
		3,
	);
	animation.start();
	animation.dispose();
	assert.equal(setWidgetCalls, 0);
});

test("council protocol invariants", () => {
	assert.deepEqual(
		normalizeConflicts([
			["P-C2", "P-C1"],
			{ proposalA: "P-C1", proposalB: "P-C2", resolved: false },
			{ for: ["P-C3", "P-C5"], resolved: false },
			{ proposalA: "P-C4", proposalB: "P-C5", resolved: true },
			{ reason: "missing endpoints" },
			null,
		]),
		[
			["P-C1", "P-C2"],
			["P-C3", "P-C5"],
		],
	);
	assert.deepEqual(normalizeConflicts({ malformed: true }), []);
	assert.deepEqual(decodeManifestArgument('{"runId":"council-test"}'), {
		runId: "council-test",
	});
	assert.throws(
		() => decodeManifestArgument("not json"),
		/JSON-encoded object/,
	);
	assert.deepEqual([3, 5, 7].map(strictMajority), [2, 3, 4]);
	assert.equal(shortTopic("a"), "a");
	assert.equal(
		validateResearchDispatch({
			tasks: [{ agent: "council-researcher" }, { agent: "council-researcher" }],
		}),
		true,
	);
	assert.equal(
		validateResearchDispatch({ tasks: [{ agent: "council-researcher" }] }),
		false,
	);
	assert.equal(
		validateResearchDispatch({
			tasks: [{ agent: "council-researcher" }, { agent: "other" }],
		}),
		false,
	);
	assert.equal(
		validateResearchDispatch({
			tasks: [{ agent: "council-researcher" }, { agent: "council-researcher" }],
			chain: [],
		}),
		false,
	);

	for (const count of [3, 5, 7] as const) {
		const manifest = validManifest(count);
		assert.equal(validateManifest(manifest).status, "CONSENSUS");
		const tally = tallyVotes(count, ["P1"], manifest.votes);
		assert.equal(tally.valid, true);
		assert.deepEqual(tally.acceptedProposalIds, ["P1"]);
		const incompleteVotes = manifest.votes.slice(0, -1);
		assert.equal(tallyVotes(count, ["P1"], incompleteVotes).valid, false);
	}

	const missingFields = validManifest(3) as unknown as Record<string, unknown>;
	delete missingFields.acceptedProposalIds;
	delete missingFields.reconciliationRounds;
	assert.throws(
		() => validateManifest(missingFields),
		/missing required top-level fields: acceptedProposalIds, reconciliationRounds/,
	);

	const seatIdManifest = validManifest(3) as unknown as {
		members: Array<Record<string, unknown>>;
	};
	seatIdManifest.members = seatIdManifest.members.map(({ id, ...rest }) => ({
		seatId: id,
		...rest,
	}));
	assert.throws(
		() => validateManifest(seatIdManifest),
		/members\[\]\.id must use the seat IDs C1, C2, C3/,
	);

	const nestedVotes = validManifest(3) as unknown as { votes: unknown[] };
	nestedVotes.votes = [{ memberId: "C1", ballots: [] }];
	assert.throws(
		() => validateManifest(nestedVotes),
		/flat array with exactly one record per member per proposal/,
	);

	const badStatus = validManifest(3);
	(badStatus as { status: string }).status = "ACCEPTED";
	assert.throws(
		() => validateManifest(badStatus),
		/exactly one of CONSENSUS, NO_CONSENSUS, UNRESOLVED_CONFLICT, or INCOMPLETE/,
	);

	const noConsensus = validManifest(3);
	noConsensus.status = "NO_CONSENSUS";
	noConsensus.acceptedProposalIds = [];
	noConsensus.votes = noConsensus.votes.map((vote) => ({
		...vote,
		vote: "NO" as const,
	}));
	assert.equal(validateManifest(noConsensus).status, "NO_CONSENSUS");

	const duplicate = validManifest(3);
	duplicate.votes.push({ ...duplicate.votes[0]! });
	assert.throws(() => validateManifest(duplicate), /vote/);

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-council-test-"));
	fs.writeFileSync(
		path.join(tempDir, "manifest.json"),
		JSON.stringify(validManifest(3)),
	);
	assert.equal(fs.existsSync(path.join(tempDir, "manifest.json")), true);
	fs.rmSync(tempDir, { recursive: true, force: true });
});
