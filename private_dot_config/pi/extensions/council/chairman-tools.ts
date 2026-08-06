import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type CouncilManifest,
	type CouncilProgressPhase,
	checkpointPatch,
	clearCheckpoint,
	loadCheckpoint,
	sanitizeFocus,
	sanitizeSeats,
	validateManifest,
	writeCheckpoint,
	writeManifest,
	writeProgress,
} from "./protocol.ts";

function decodeStructured(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value.trim());
	} catch {
		return undefined;
	}
}

function progressStatus(
	phase: CouncilProgressPhase,
): "RUNNING" | "COMPLETE" | "FAILED" {
	if (phase === "complete") return "COMPLETE";
	if (phase === "failed") return "FAILED";
	return "RUNNING";
}

export function decodeManifestArgument(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		throw new Error(
			"Council manifest must be an object or a JSON-encoded object.",
		);
	}
}

export default function chairmanTools(pi: ExtensionAPI): void {
	let published = false;
	pi.registerTool({
		name: "council_publish",
		label: "Publish Council Report",
		description:
			"Validate and persist the single final machine-auditable council manifest. Sections already saved with council_checkpoint are merged in automatically, so this call only needs the sections not yet checkpointed plus status and report. Required top-level fields: version, runId, createdAt, question, memberCount, status, members, research, proposals, readiness, votes, acceptedProposalIds, conflicts, reconciliationRounds, report. manifest.status must be exactly CONSENSUS, NO_CONSENSUS, UNRESOLVED_CONFLICT, or INCOMPLETE. There is no nested outcome object.",
		promptSnippet: "Validate and publish the council manifest exactly once",
		parameters: Type.Object({
			manifest: Type.Union([
				Type.Record(Type.String(), Type.Any()),
				Type.String(),
			]),
		}),
		async execute(_toolCallId, params) {
			if (published)
				throw new Error(
					"The council chairman may publish exactly one authoritative manifest.",
				);
			const supplied = decodeManifestArgument(params.manifest) as
				| Partial<CouncilManifest>
				| undefined;
			const runId =
				typeof supplied?.runId === "string" ? supplied.runId : undefined;
			const checkpoint = runId ? loadCheckpoint(runId) : undefined;
			const manifest = validateManifest(
				checkpoint && supplied ? { ...checkpoint, ...supplied } : supplied,
			);
			writeManifest(manifest);
			clearCheckpoint(manifest.runId);
			writeProgress({
				version: 1,
				runId: manifest.runId,
				updatedAt: Date.now(),
				phase: "complete",
				message: "Council report published.",
				status: "COMPLETE",
			});
			published = true;
			return {
				content: [{ type: "text", text: manifest.report }],
				details: {
					runId: manifest.runId,
					status: manifest.status,
				},
			};
		},
	});
	pi.registerTool({
		name: "council_checkpoint",
		label: "Checkpoint Council Phase",
		description:
			"Durably save a completed council phase so the run survives a chairman timeout or crash. Pass a partial manifest with any of: version, runId, createdAt, question, memberCount, chairmanModel, researcherModel, modelWarning, members, research, proposals, readiness, votes, conflicts, reconciliationRounds. Call this after every phase, before starting the next one.",
		promptSnippet: "Checkpoint the completed council phase",
		parameters: Type.Object({
			runId: Type.String(),
			patch: Type.Union([
				Type.Record(Type.String(), Type.Any()),
				Type.String(),
			]),
		}),
		async execute(_toolCallId, params) {
			const patch = checkpointPatch(decodeManifestArgument(params.patch));
			const merged = writeCheckpoint(params.runId, patch);
			const sections = Object.keys(merged).filter((key) => key !== "runId");
			return {
				content: [
					{
						type: "text",
						text: `Checkpoint saved. Stored sections: ${sections.join(", ")}.`,
					},
				],
				details: { runId: params.runId, sections },
			};
		},
	});
	pi.registerTool({
		name: "council_progress",
		label: "Update Council Progress",
		description:
			"Persist a concise council phase update, per-seat activity, and the proposal currently on the floor for the human operator's live chamber view. Seat activities: seated, briefing, researching, research-complete, drafting, proposed, aligning, ready, voted-yes, voted-no, reconciling, replaced, stalled, failed.",
		promptSnippet:
			"Publish a council progress breadcrumb with seat activity and current proposal",
		parameters: Type.Object({
			runId: Type.String(),
			phase: Type.String(),
			message: Type.String(),
			completed: Type.Optional(Type.Number()),
			total: Type.Optional(Type.Number()),
			seats: Type.Optional(
				Type.Union([
					Type.Array(
						Type.Object({
							memberId: Type.String(),
							activity: Type.String(),
							detail: Type.Optional(Type.String()),
							researchersPending: Type.Optional(Type.Number()),
						}),
					),
					Type.String(),
				]),
			),
			focus: Type.Optional(
				Type.Union([
					Type.Object({
						proposalId: Type.String(),
						title: Type.String(),
						yes: Type.Optional(Type.Number()),
						no: Type.Optional(Type.Number()),
					}),
					Type.String(),
				]),
			),
		}),
		async execute(_toolCallId, params) {
			const phase = params.phase as CouncilProgressPhase;
			const seats = sanitizeSeats(decodeStructured(params.seats));
			const focus = sanitizeFocus(decodeStructured(params.focus));
			writeProgress({
				version: 1,
				runId: params.runId,
				updatedAt: Date.now(),
				phase,
				message: params.message,
				completed: params.completed,
				total: params.total,
				status: progressStatus(phase),
				seats,
				focus,
			});
			return {
				content: [
					{
						type: "text",
						text: `Progress recorded: ${phase}${seats ? ` with ${seats.length} seat states` : ""}${focus ? ` focused on ${focus.proposalId}` : ""}`,
					},
				],
				details: { runId: params.runId, phase },
			};
		},
	});
}
