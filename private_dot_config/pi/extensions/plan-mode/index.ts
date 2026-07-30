import {
	getSupportedThinkingLevels,
	type AssistantMessage,
	type ModelThinkingLevel,
	type TextContent,
} from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	extractTodoItems,
	isSafeCommand,
	markCompletedSteps,
	type TodoItem,
	validatePlanModeSubagentCall,
} from "./utils.ts";

const PLAN_CONFIG_PATH = join(getAgentDir(), "plan-mode.json");

const MODEL_SETTINGS_STATE_KEY =
	"__piPlanModeSessionOnlyModelSettings" as const;

interface SessionOnlyModelSettingsState {
	scope: AsyncLocalStorage<boolean>;
}

type PlanModeGlobal = typeof globalThis & {
	[MODEL_SETTINGS_STATE_KEY]?: SessionOnlyModelSettingsState;
};

function getSessionOnlyModelSettings(): AsyncLocalStorage<boolean> {
	const planModeGlobal = globalThis as PlanModeGlobal;
	const existingState = planModeGlobal[MODEL_SETTINGS_STATE_KEY];
	if (existingState) return existingState.scope;

	const scope = new AsyncLocalStorage<boolean>();
	const settingsManagerPrototype = SettingsManager.prototype;
	const persistDefaultModelAndProvider =
		settingsManagerPrototype.setDefaultModelAndProvider;
	const persistDefaultThinkingLevel =
		settingsManagerPrototype.setDefaultThinkingLevel;

	settingsManagerPrototype.setDefaultModelAndProvider = function (
		provider: string,
		modelId: string,
	): void {
		if (scope.getStore()) return;
		persistDefaultModelAndProvider.call(this, provider, modelId);
	};
	settingsManagerPrototype.setDefaultThinkingLevel = function (
		level: ModelThinkingLevel,
	): void {
		if (scope.getStore()) return;
		persistDefaultThinkingLevel.call(this, level);
	};
	planModeGlobal[MODEL_SETTINGS_STATE_KEY] = { scope };
	return scope;
}

const sessionOnlyModelSettings = getSessionOnlyModelSettings();

function withSessionOnlyModelSettings<T>(
	operation: () => Promise<T>,
): Promise<T> {
	return sessionOnlyModelSettings.run(true, operation);
}

interface ModelSettings {
	provider: string;
	model: string;
	thinkingLevel: ModelThinkingLevel;
}

type PlannerSettings = ModelSettings;

interface PlanModeConfig {
	planner?: PlannerSettings;
}

const PLAN_ALLOWED_TOOLS = new Set([
	"read",
	"bash",
	"grep",
	"find",
	"ls",
	"questionnaire",
	"web_search",
	"get_search_content",
	"lens_diagnostics",
	"lsp_diagnostics",
	"module_report",
	"read_symbol",
	"read_enclosing",
	"symbol_search",
	"ast_grep_search",
	"ast_grep_outline",
	"ast_grep_dump",
	"subagent",
	"subagent_wait",
	"subagent_supervisor",
	"intercom",
]);

interface PlanModeState {
	enabled: boolean;
	todos: TodoItem[];
	executing: boolean;
	toolsBeforePlanMode?: string[];
	modelBeforePlanMode?: ModelSettings;
}

function isThinkingLevel(value: unknown): value is ModelThinkingLevel {
	return (
		typeof value === "string" &&
		["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value)
	);
}

function loadConfig(): PlanModeConfig {
	try {
		const parsed = JSON.parse(readFileSync(PLAN_CONFIG_PATH, "utf8")) as {
			planner?: Partial<PlannerSettings>;
		};
		const planner = parsed.planner;
		if (
			typeof planner?.provider === "string" &&
			typeof planner.model === "string" &&
			isThinkingLevel(planner.thinkingLevel)
		) {
			return {
				planner: {
					provider: planner.provider,
					model: planner.model,
					thinkingLevel: planner.thinkingLevel,
				},
			};
		}
	} catch {
		// Missing or malformed config is handled by the first-use picker.
	}
	return {};
}

function saveConfig(config: PlanModeConfig): void {
	mkdirSync(dirname(PLAN_CONFIG_PATH), { recursive: true });
	writeFileSync(
		PLAN_CONFIG_PATH,
		`${JSON.stringify(config, null, 2)}\n`,
		"utf8",
	);
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
	if (!message || typeof message !== "object") return false;
	const candidate = message as { role?: unknown; content?: unknown };
	return candidate.role === "assistant" && Array.isArray(candidate.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export default function planMode(pi: ExtensionAPI): void {
	let enabled = false;
	let executing = false;
	let todos: TodoItem[] = [];
	let toolsBeforePlanMode: string[] | undefined;
	let modelBeforePlanMode: ModelSettings | undefined;
	let pendingFollowUp: string | undefined;
	let config = loadConfig();

	pi.registerFlag("plan", {
		description: "Start in strict read-only plan mode",
		type: "boolean",
		default: false,
	});

	function updateUi(ctx: ExtensionContext): void {
		if (executing && todos.length > 0) {
			const done = todos.filter((todo) => todo.completed).length;
			ctx.ui.setStatus(
				"plan-mode",
				ctx.ui.theme.fg("accent", `plan ${done}/${todos.length}`),
			);
			ctx.ui.setWidget(
				"plan-todos",
				todos.map((todo) =>
					todo.completed
						? ctx.ui.theme.fg("success", "✓ ") +
							ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(todo.text))
						: ctx.ui.theme.fg("muted", "○ ") + todo.text,
				),
			);
			return;
		}
		ctx.ui.setWidget("plan-todos", undefined);
		ctx.ui.setStatus(
			"plan-mode",
			enabled ? ctx.ui.theme.fg("warning", "plan: read-only") : undefined,
		);
	}

	function persist(): void {
		pi.appendEntry<PlanModeState>("plan-mode", {
			enabled,
			todos,
			executing,
			toolsBeforePlanMode,
			modelBeforePlanMode,
		});
	}

	function enableTools(): void {
		if (toolsBeforePlanMode === undefined)
			toolsBeforePlanMode = pi.getActiveTools();
		const available = new Set(pi.getAllTools().map((tool) => tool.name));
		pi.setActiveTools(
			[...PLAN_ALLOWED_TOOLS].filter((name) => available.has(name)),
		);
	}

	function restoreTools(): void {
		if (toolsBeforePlanMode) pi.setActiveTools(toolsBeforePlanMode);
		toolsBeforePlanMode = undefined;
	}

	async function choosePlannerSettings(
		ctx: ExtensionContext,
	): Promise<PlannerSettings | undefined> {
		await ctx.modelRegistry.refresh();
		const available = ctx.modelRegistry.getAvailable();
		if (available.length === 0) {
			ctx.ui.notify("No authenticated models are available.", "error");
			return;
		}

		const providers = [
			...new Set(available.map((model) => model.provider)),
		].sort((left, right) => left.localeCompare(right));
		const providerLabels = new Map(
			providers.map((provider) => [
				`${ctx.modelRegistry.getProviderDisplayName(provider)} (${provider})`,
				provider,
			]),
		);
		const providerLabel = await ctx.ui.select(
			"Planner model: select a provider",
			[...providerLabels.keys()],
		);
		const provider = providerLabel
			? providerLabels.get(providerLabel)
			: undefined;
		if (!provider) return;

		const providerModels = available
			.filter((model) => model.provider === provider)
			.sort((left, right) => left.id.localeCompare(right.id));
		const modelLabels = new Map(
			providerModels.map((model) => [
				model.name && model.name !== model.id
					? `${model.id} - ${model.name}`
					: model.id,
				model,
			]),
		);
		const modelLabel = await ctx.ui.select("Planner model: select a model", [
			...modelLabels.keys(),
		]);
		const model = modelLabel ? modelLabels.get(modelLabel) : undefined;
		if (!model) return;

		const thinkingLevels = getSupportedThinkingLevels(model);
		const thinkingLevel = await ctx.ui.select(
			"Planner model: select a thinking level",
			thinkingLevels,
		);
		if (!thinkingLevel || !isThinkingLevel(thinkingLevel)) return;

		return {
			provider: model.provider,
			model: model.id,
			thinkingLevel,
		};
	}

	async function applyPlannerSettings(
		settings: PlannerSettings,
		ctx: ExtensionContext,
	): Promise<boolean> {
		const model = ctx.modelRegistry.find(settings.provider, settings.model);
		if (!model) {
			ctx.ui.notify(
				`Planner model ${settings.provider}/${settings.model} is unavailable.`,
				"error",
			);
			return false;
		}
		return withSessionOnlyModelSettings(async () => {
			if (!(await pi.setModel(model))) {
				ctx.ui.notify(
					`Planner model ${settings.provider}/${settings.model} has no configured authentication.`,
					"error",
				);
				return false;
			}
			pi.setThinkingLevel(settings.thinkingLevel);
			return true;
		});
	}

	async function activatePlanner(ctx: ExtensionContext): Promise<boolean> {
		const savedSettings = config.planner;
		let settings = savedSettings;
		const configuredModel = savedSettings
			? ctx.modelRegistry
					.getAvailable()
					.find(
						(model) =>
							model.provider === savedSettings.provider &&
							model.id === savedSettings.model,
					)
			: undefined;
		if (!settings || !configuredModel) {
			if (!ctx.hasUI) {
				ctx.ui.notify(
					"Configure a planner model with /plan-model before using plan mode without a UI.",
					"error",
				);
				return false;
			}
			settings = await choosePlannerSettings(ctx);
			if (!settings) return false;
			config = { ...config, planner: settings };
			saveConfig(config);
		}
		return applyPlannerSettings(settings, ctx);
	}

	function captureModelBeforePlanMode(ctx: ExtensionContext): boolean {
		if (modelBeforePlanMode) return true;
		if (!ctx.model) {
			ctx.ui.notify(
				"Plan mode cannot start because there is no active model to restore later.",
				"error",
			);
			return false;
		}
		modelBeforePlanMode = {
			provider: ctx.model.provider,
			model: ctx.model.id,
			thinkingLevel: pi.getThinkingLevel(),
		};
		return true;
	}

	async function restoreModelBeforePlanMode(
		ctx: ExtensionContext,
	): Promise<boolean> {
		if (!modelBeforePlanMode) {
			ctx.ui.notify(
				"Plan mode cannot exit because the pre-plan model state is unavailable.",
				"error",
			);
			return false;
		}
		const previousSettings = modelBeforePlanMode;
		const model = ctx.modelRegistry.find(
			previousSettings.provider,
			previousSettings.model,
		);
		if (!model) {
			ctx.ui.notify(
				`Pre-plan model ${previousSettings.provider}/${previousSettings.model} is unavailable or unauthenticated.`,
				"error",
			);
			return false;
		}
		return withSessionOnlyModelSettings(async () => {
			if (!(await pi.setModel(model))) {
				ctx.ui.notify(
					`Pre-plan model ${previousSettings.provider}/${previousSettings.model} is unavailable or unauthenticated.`,
					"error",
				);
				return false;
			}
			pi.setThinkingLevel(previousSettings.thinkingLevel);
			return true;
		});
	}

	async function toggle(ctx: ExtensionContext): Promise<void> {
		if (!enabled) {
			if (!captureModelBeforePlanMode(ctx)) return;
			if (!(await activatePlanner(ctx))) {
				modelBeforePlanMode = undefined;
				return;
			}
			enabled = true;
			executing = false;
			todos = [];
			enableTools();
			ctx.ui.notify("Plan mode enabled: strict read-only tools only.", "info");
		} else {
			if (!(await restoreModelBeforePlanMode(ctx))) return;
			enabled = false;
			executing = false;
			todos = [];
			modelBeforePlanMode = undefined;
			restoreTools();
			ctx.ui.notify("Plan mode disabled: pre-plan model restored.", "info");
		}
		updateUi(ctx);
		persist();
	}

	pi.registerCommand("plan", {
		description: "Toggle strict read-only plan mode",
		handler: async (_args, ctx) => toggle(ctx),
	});

	pi.registerCommand("plan-model", {
		description: "Configure the planner model and thinking level",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("The planner model picker requires a UI.", "error");
				return;
			}
			const settings = await choosePlannerSettings(ctx);
			if (!settings) return;
			config = { ...config, planner: settings };
			saveConfig(config);
			if (enabled && !(await applyPlannerSettings(settings, ctx))) return;
			ctx.ui.notify(
				`Planner configured: ${settings.provider}/${settings.model} (${settings.thinkingLevel})`,
				"info",
			);
		},
	});

	pi.registerCommand("todos", {
		description: "Show progress for the approved plan",
		handler: async (_args, ctx) => {
			if (todos.length === 0) {
				ctx.ui.notify("No active plan steps.", "info");
				return;
			}
			ctx.ui.notify(
				todos
					.map(
						(todo) =>
							`${todo.step}. ${todo.completed ? "✓" : "○"} ${todo.text}`,
					)
					.join("\n"),
				"info",
			);
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle strict plan mode",
		handler: async (ctx) => toggle(ctx),
	});

	pi.on("tool_call", async (event) => {
		if (!enabled) return;
		if (!PLAN_ALLOWED_TOOLS.has(event.toolName)) {
			return {
				block: true,
				reason: `Plan mode is read-only: tool '${event.toolName}' is disabled until the plan is approved.`,
			};
		}
		if (event.toolName === "subagent") {
			const violation = validatePlanModeSubagentCall(event.input);
			if (violation) {
				return {
					block: true,
					reason: `Plan mode blocked the subagent request because ${violation}. Use only configured read-only agents for exploration, research, planning, and review.`,
				};
			}
		}
		if (event.toolName === "bash") {
			const command = (event.input as Record<string, unknown>).command;
			if (typeof command !== "string" || !isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode blocked a non-allowlisted shell command. Disable plan mode only after explicit approval.\nCommand: ${String(command)}`,
				};
			}
		}
	});

	pi.on("context", async (event) => {
		if (enabled) return;
		return {
			messages: event.messages.filter((message) => {
				const custom = message as { customType?: string };
				if (custom.customType === "plan-mode-context") return false;
				if (message.role !== "user") return true;
				const content = message.content;
				if (typeof content === "string")
					return !content.includes("[PI PLAN MODE ACTIVE]");
				return (
					!Array.isArray(content) ||
					!content.some(
						(part) =>
							part.type === "text" &&
							part.text.includes("[PI PLAN MODE ACTIVE]"),
					)
				);
			}),
		};
	});

	pi.on("before_agent_start", async () => {
		if (enabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PI PLAN MODE ACTIVE]\nYou are in strict read-only plan mode.\n\n- Inspect and reason only. Do not modify source files, external services, dependencies, repository state, or infrastructure.\n- Only allowlisted read and analysis tools are active. Shell commands are restricted to conservative read-only forms.\n- You may use the subagent tool to parallelize read-only exploration, research, planning, and review. Call its list action before execution, use only configured read-only agents, and never launch worker or an unknown/custom agent. Do not request worktrees, session sharing, or explicit output/session paths.\n- Never invoke Git. Use only allowlisted read-only jj queries.\n- Do not create worktrees or additional workspaces.\n- Ask targeted clarifying questions with the questionnaire tool when a requirement or design decision is ambiguous.\n- Do not write a plan file. Keep the plan in the session.\n\nEnd with a concrete numbered section exactly under a "Plan:" heading. Do not implement until the user approves through the plan-mode approval dialog.`,
					display: false,
				},
			};
		}
		if (executing && todos.length > 0) {
			const remaining = todos
				.filter((todo) => !todo.completed)
				.map((todo) => `${todo.step}. ${todo.text}`)
				.join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING APPROVED PLAN]\n\nRemaining steps:\n${remaining}\n\nExecute only the approved scope. Use no Git commands, worktrees, or additional workspaces. Include [DONE:n] after completing each numbered step.`,
					display: false,
				},
			};
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!executing || todos.length === 0 || !isAssistantMessage(event.message))
			return;
		if (markCompletedSteps(getTextContent(event.message), todos) > 0)
			updateUi(ctx);
		persist();
	});

	pi.on("agent_end", async (event, ctx) => {
		if (executing && todos.length > 0) {
			if (todos.every((todo) => todo.completed)) {
				pi.sendMessage(
					{
						customType: "plan-complete",
						content: `**Approved plan complete**\n\n${todos.map((todo) => `- ${todo.text}`).join("\n")}`,
						display: true,
					},
					{ triggerTurn: false },
				);
				executing = false;
				todos = [];
				updateUi(ctx);
				persist();
			}
			return;
		}
		if (!enabled || !ctx.hasUI) return;

		const lastAssistant = [...event.messages]
			.reverse()
			.find(isAssistantMessage);
		if (lastAssistant) todos = extractTodoItems(getTextContent(lastAssistant));
		if (todos.length === 0) return;
		persist();

		const preview = todos
			.map((todo) => `${todo.step}. ${todo.text}`)
			.join("\n");
		const choice = await ctx.ui.select(
			`Plan ready:\n\n${preview}\n\nNext action`,
			["Approve and execute", "Stay in read-only plan mode", "Refine the plan"],
		);

		if (choice === "Approve and execute") {
			if (!(await restoreModelBeforePlanMode(ctx))) {
				ctx.ui.notify(
					"Plan remains read-only because the pre-plan model could not be restored.",
					"warning",
				);
				return;
			}
			enabled = false;
			executing = true;
			modelBeforePlanMode = undefined;
			restoreTools();
			updateUi(ctx);
			persist();
			pendingFollowUp = `Execute the approved plan in order:\n\n${preview}\n\nStart with step 1 and include [DONE:n] after each completed step.`;
			return;
		}
		if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("How should the plan change?", "");
			if (refinement?.trim()) pendingFollowUp = refinement.trim();
		}
	});

	// agent_end runs before Pi has fully settled the current agent run. Queueing a
	// user message there can race with the streaming-state transition, so defer it
	// until agent_settled, when a normal send starts the next turn safely.
	pi.on("agent_settled", async () => {
		if (!pendingFollowUp) return;
		const message = pendingFollowUp;
		pendingFollowUp = undefined;
		pi.sendUserMessage(message);
	});

	pi.on("session_start", async (event, ctx) => {
		config = loadConfig();
		modelBeforePlanMode = undefined;
		if (event.reason === "new") {
			enabled = pi.getFlag("plan") === true;
			executing = false;
			todos = [];
			toolsBeforePlanMode = undefined;
			pendingFollowUp = undefined;
		} else {
			enabled = pi.getFlag("plan") === true;
			const stateEntry = ctx.sessionManager
				.getEntries()
				.filter(
					(entry: any) =>
						entry.type === "custom" && entry.customType === "plan-mode",
				)
				.pop() as { data?: PlanModeState } | undefined;
			if (stateEntry?.data) {
				enabled = stateEntry.data.enabled;
				executing = stateEntry.data.executing;
				todos = stateEntry.data.todos ?? [];
				toolsBeforePlanMode = stateEntry.data.toolsBeforePlanMode;
				modelBeforePlanMode = stateEntry.data.modelBeforePlanMode;
			}
		}
		if (enabled) {
			if (captureModelBeforePlanMode(ctx) && (await activatePlanner(ctx))) {
				enableTools();
				persist();
			} else {
				enabled = false;
				modelBeforePlanMode = undefined;
				restoreTools();
			}
		}
		updateUi(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!enabled || !modelBeforePlanMode) return;
		await restoreModelBeforePlanMode(ctx);
	});
}
