import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function validateResearchDispatch(
	input: Record<string, unknown>,
): boolean {
	const tasks = input.tasks;
	return (
		input.action === undefined &&
		input.chain === undefined &&
		input.agent === undefined &&
		Array.isArray(tasks) &&
		tasks.length === 2 &&
		tasks.every(
			(task) =>
				Boolean(task) &&
				typeof task === "object" &&
				(task as Record<string, unknown>).agent === "council-researcher",
		)
	);
}

export default function councilMemberGuard(pi: ExtensionAPI): void {
	let researchDispatchUsed = false;
	pi.on("tool_call", (event) => {
		if (event.toolName !== "subagent") return;
		const input = event.input as Record<string, unknown>;
		if (input.action === "list") return;
		if (input.action !== undefined)
			return {
				block: true,
				reason:
					"Council members may only list agents or perform their one research dispatch.",
			};
		if (researchDispatchUsed)
			return {
				block: true,
				reason: "This council member already used its one research dispatch.",
			};
		if (!validateResearchDispatch(input))
			return {
				block: true,
				reason:
					"A council member must dispatch exactly two council-researcher tasks in one parallel call.",
			};
		researchDispatchUsed = true;
	});
}
