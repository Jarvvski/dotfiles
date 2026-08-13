const SAFE_SIMPLE_COMMANDS = new Set([
	"cat",
	"head",
	"tail",
	"less",
	"more",
	"grep",
	"rg",
	"find",
	"fd",
	"ls",
	"pwd",
	"wc",
	"sort",
	"uniq",
	"diff",
	"file",
	"stat",
	"du",
	"df",
	"tree",
	"which",
	"whereis",
	"type",
	"env",
	"printenv",
	"uname",
	"whoami",
	"id",
	"date",
	"cal",
	"uptime",
	"ps",
	"jq",
	"bat",
	"eza",
]);

function hasShellMutationSyntax(command: string): boolean {
	return /[;&|`<>\n\r]|\$\(|\$\{|\b(xargs|tee|eval|exec|source)\b/i.test(
		command,
	);
}

function safeFind(tokens: string[]): boolean {
	return !tokens.some((token) =>
		/^(?:-delete|-exec|-execdir|-ok|-okdir|-fprint|-fprintf|-fls)$/i.test(
			token,
		),
	);
}

function safeJj(command: string): boolean {
	const patterns = [
		/^jj\s+(?:status|st|log|diff|show|root|evolog|obslog|interdiff)\b/i,
		/^jj\s+bookmark\s+list\b/i,
		/^jj\s+tag\s+list\b/i,
		/^jj\s+workspace\s+list\b/i,
		/^jj\s+op\s+log\b/i,
		/^jj\s+file\s+(?:list|show)\b/i,
		/^jj\s+resolve\s+--list\b/i,
		/^jj\s+config\s+list\b/i,
		/^jj\s+git\s+remote\s+list\b/i,
	];
	return patterns.some((pattern) => pattern.test(command));
}

function safeGh(command: string): boolean {
	return [
		/^gh\s+auth\s+status\b/i,
		/^gh\s+pr\s+(?:list|view|diff|checks|status)\b/i,
		/^gh\s+issue\s+(?:list|view|status)\b/i,
		/^gh\s+run\s+(?:list|view)\b/i,
		/^gh\s+api\b(?=.*(?:--method|-X)\s+GET\b)(?!.*\s(?:-f|--field|-F|--raw-field)\b)/i,
	].some((pattern) => pattern.test(command));
}

function safePackageInfo(command: string): boolean {
	return /^(?:npm|bunx?\s+npm)\s+(?:list|ls|view|info|search|outdated|audit)\b/i.test(
		command,
	);
}

export function isSafeCommand(command: string): boolean {
	const normalized = command.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
	if (!normalized || hasShellMutationSyntax(normalized)) return false;
	if (
		/(^|\s)(?:[^\s/]+\/)*git(?=\s|$)/i.test(
			normalized.replace(/\bjj\s+git\b/gi, "jj-vcs"),
		)
	)
		return false;
	if (safeJj(normalized) || safeGh(normalized) || safePackageInfo(normalized))
		return true;
	if (/^(?:node|python|python3|bun|uv|java)\s+--version\b/i.test(normalized))
		return true;

	const tokens = normalized.split(/\s+/);
	const executable = tokens[0]?.replace(/^.*\//, "");
	if (!executable || !SAFE_SIMPLE_COMMANDS.has(executable)) return false;
	if (
		(executable === "find" || executable === "fd") &&
		!safeFind(tokens.slice(1))
	)
		return false;
	if (executable === "env" && tokens.length > 1) return false;
	return true;
}

const PLAN_MODE_READ_ONLY_SUBAGENTS = new Set([
	"context-builder",
	"delegate",
	"oracle",
	"planner",
	"researcher",
	"reviewer",
	"scout",
]);

const PLAN_MODE_SAFE_SUBAGENT_ACTIONS = new Set([
	"doctor",
	"get",
	"interrupt",
	"list",
	"models",
	"schedule-list",
	"schedule-status",
	"status",
	"stop",
	"watchdog.check",
	"watchdog.recommend-model",
	"watchdog.status",
]);

const PLAN_MODE_SUBAGENT_RUN_LIMIT = 100;

export interface PlanModeSubagentRun {
	agents: Array<string | null>;
	updatedAt: number;
}

export type PlanModeSubagentRuns = Record<string, PlanModeSubagentRun>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

export function recordPlanModeSubagentRun(
	runs: PlanModeSubagentRuns,
	event: unknown,
): boolean {
	if (!isRecord(event)) return false;
	const runId = nonEmptyString(event.runId) ?? nonEmptyString(event.id);
	if (!runId) return false;

	const existing = runs[runId];
	const agents = [...(existing?.agents ?? [])];
	let changed = false;
	const setAgent = (index: number, value: unknown): void => {
		const agent = nonEmptyString(value);
		if (!agent || !Number.isInteger(index) || index < 0) return;
		while (agents.length <= index) agents.push(null);
		if (agents[index] === agent) return;
		agents[index] = agent;
		changed = true;
	};

	if (Array.isArray(event.agents)) {
		for (const [index, agent] of event.agents.entries()) setAgent(index, agent);
	}
	if (Array.isArray(event.results)) {
		for (const [fallbackIndex, result] of event.results.entries()) {
			if (!isRecord(result)) continue;
			const index =
				typeof result.index === "number" ? result.index : fallbackIndex;
			setAgent(index, result.agent);
		}
	}
	const eventIndex = typeof event.taskIndex === "number" ? event.taskIndex : 0;
	setAgent(eventIndex, event.agent);

	if (!changed) return false;
	runs[runId] = {
		agents,
		updatedAt:
			typeof event.timestamp === "number" ? event.timestamp : Date.now(),
	};

	const entries = Object.entries(runs);
	if (entries.length > PLAN_MODE_SUBAGENT_RUN_LIMIT) {
		entries
			.sort(([, left], [, right]) => left.updatedAt - right.updatedAt)
			.slice(0, entries.length - PLAN_MODE_SUBAGENT_RUN_LIMIT)
			.forEach(([id]) => delete runs[id]);
	}
	return true;
}

export function restorePlanModeSubagentRuns(
	entries: unknown[],
	runs: PlanModeSubagentRuns,
): boolean {
	const toolCalls = new Map<string, Record<string, unknown>>();
	let changed = false;
	for (const entry of entries) {
		if (
			!isRecord(entry) ||
			entry.type !== "message" ||
			!isRecord(entry.message)
		)
			continue;
		const message = entry.message;
		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const part of message.content) {
				if (
					isRecord(part) &&
					part.type === "toolCall" &&
					part.name === "subagent" &&
					typeof part.id === "string" &&
					isRecord(part.arguments)
				) {
					toolCalls.set(part.id, part.arguments);
				}
			}
			continue;
		}
		if (
			message.role !== "toolResult" ||
			message.toolName !== "subagent" ||
			typeof message.toolCallId !== "string" ||
			!isRecord(message.details)
		)
			continue;

		if (recordPlanModeSubagentRun(runs, message.details)) changed = true;
		const launchInput = toolCalls.get(message.toolCallId);
		if (!launchInput || launchInput.action !== undefined) continue;
		const runId =
			nonEmptyString(message.details.runId) ??
			nonEmptyString(message.details.asyncId);
		if (!runId) continue;
		const agents = new Set<string>();
		collectAgentNames(launchInput, agents);
		if (
			agents.size > 0 &&
			recordPlanModeSubagentRun(runs, { runId, agents: [...agents] })
		)
			changed = true;
	}
	return changed;
}

function collectAgentNames(value: unknown, names: Set<string>): void {
	if (Array.isArray(value)) {
		for (const item of value) collectAgentNames(item, names);
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, item] of Object.entries(value)) {
		if (key === "agent" && typeof item === "string") names.add(item);
		else collectAgentNames(item, names);
	}
}

function findUnsafeSubagentOption(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		for (const item of value) {
			const unsafe = findUnsafeSubagentOption(item);
			if (unsafe) return unsafe;
		}
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, item] of Object.entries(value)) {
		if (key === "worktree" && item === true) return "worktree mode";
		if (key === "share" && item === true) return "session sharing";
		if (
			(key === "chainDir" || key === "sessionDir") &&
			typeof item === "string" &&
			item.length > 0
		)
			return `an explicit ${key} path`;
		if (key === "output" && item !== undefined && item !== false)
			return "an explicit output path";
		const unsafe = findUnsafeSubagentOption(item);
		if (unsafe) return unsafe;
	}
}

function unsafePlanModeAgents(agents: Iterable<string>): string[] {
	return [...agents].filter(
		(agent) => !PLAN_MODE_READ_ONLY_SUBAGENTS.has(agent),
	);
}

function validatePlanModeSubagentResume(
	input: Record<string, unknown>,
	runs: Readonly<PlanModeSubagentRuns>,
): string | undefined {
	const unsafeOption = findUnsafeSubagentOption(input);
	if (unsafeOption) return `${unsafeOption} is disabled`;

	const requestedAgents = new Set<string>();
	collectAgentNames(input, requestedAgents);
	const unsafeRequestedAgents = unsafePlanModeAgents(requestedAgents);
	if (unsafeRequestedAgents.length > 0) {
		return `only configured read-only agents are allowed; blocked: ${unsafeRequestedAgents.join(", ")}`;
	}

	const requestedId = nonEmptyString(input.id) ?? nonEmptyString(input.runId);
	if (!requestedId) return "action 'resume' requires id or runId";
	const exact = runs[requestedId];
	const matches = exact
		? ([[requestedId, exact]] as const)
		: Object.entries(runs).filter(([id]) => id.startsWith(requestedId));
	if (matches.length === 0)
		return `resume target '${requestedId}' is unknown or has no recorded agent metadata`;
	if (matches.length > 1)
		return `resume target prefix '${requestedId}' is ambiguous; provide the full run id`;

	const [runId, run] = matches[0];
	if (!run || !Array.isArray(run.agents) || run.agents.length === 0) {
		return `resume target '${runId}' has no recorded agent metadata`;
	}
	if (input.index !== undefined && !Number.isInteger(input.index)) {
		return `resume target '${runId}' index must be an integer`;
	}
	const targetAgents =
		typeof input.index === "number" ? [run.agents[input.index]] : run.agents;
	if (targetAgents.length === 0 || targetAgents.some((agent) => !agent)) {
		return `resume target '${runId}' has incomplete agent metadata`;
	}
	const unsafeTargetAgents = unsafePlanModeAgents(
		targetAgents.filter((agent): agent is string => typeof agent === "string"),
	);
	if (unsafeTargetAgents.length > 0) {
		return `resume target '${runId}' includes non-read-only agents: ${unsafeTargetAgents.join(", ")}`;
	}
}

export function validatePlanModeSubagentCall(
	input: unknown,
	runs: Readonly<PlanModeSubagentRuns> = {},
): string | undefined {
	if (!isRecord(input)) return "the request is malformed";
	if (typeof input.action === "string") {
		if (input.action === "resume")
			return validatePlanModeSubagentResume(input, runs);
		return PLAN_MODE_SAFE_SUBAGENT_ACTIONS.has(input.action)
			? undefined
			: `action '${input.action}' is not read-only`;
	}

	const unsafeOption = findUnsafeSubagentOption(input);
	if (unsafeOption) return `${unsafeOption} is disabled`;

	const agents = new Set<string>();
	collectAgentNames(input, agents);
	if (agents.size === 0)
		return "the request does not name agents whose read-only policy can be verified";
	const unsafeAgents = unsafePlanModeAgents(agents);
	if (unsafeAgents.length > 0)
		return `only configured read-only agents are allowed; blocked: ${unsafeAgents.join(", ")}`;
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
	if (cleaned.length > 0)
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const header = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!header?.index && header?.index !== 0) return [];
	const section = message.slice(header.index + header[0].length);
	const items: TodoItem[] = [];
	for (const match of section.matchAll(/^\s*(\d+)[.)]\s+(.+)$/gm)) {
		const text = cleanStepText(match[2].replace(/\*{1,2}$/, "").trim());
		if (text.length > 3)
			items.push({ step: items.length + 1, text, completed: false });
	}
	return items;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	let changed = 0;
	for (const match of text.matchAll(/\[DONE:(\d+)\]/gi)) {
		const item = items.find((candidate) => candidate.step === Number(match[1]));
		if (item && !item.completed) {
			item.completed = true;
			changed++;
		}
	}
	return changed;
}
