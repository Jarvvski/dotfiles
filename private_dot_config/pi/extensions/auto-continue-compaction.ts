import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONTINUATION_PROMPT = `[AUTOMATIC CONTEXT COMPACTION COMPLETED]
Resume the active user task from the compaction summary and retained recent messages. Reconcile the summary with the actual working state, then continue from the next unfinished step without asking the user to restate the task or repeating completed work. If no work remains, give the final answer now.`;

export default function autoContinueCompaction(pi: ExtensionAPI) {
	pi.on("session_compact", (event, ctx) => {
		if (
			event.reason !== "threshold" ||
			event.willRetry ||
			ctx.hasPendingMessages()
		)
			return;

		pi.sendMessage(
			{
				customType: "auto-compaction-continuation",
				content: CONTINUATION_PROMPT,
				display: false,
				details: { compactionEntryId: event.compactionEntry.id },
			},
			{
				deliverAs: "followUp",
				triggerTurn: true,
			},
		);
	});
}
