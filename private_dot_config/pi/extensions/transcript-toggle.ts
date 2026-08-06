import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	CustomEditor,
	getAgentDir,
	SettingsManager,
	type AppKeybinding,
	type ExtensionAPI,
	type ExtensionContext,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";

type AppActionEditor = {
	actionHandlers: Map<AppKeybinding, () => void>;
};

function hasAppActionHandlers(editor: unknown): editor is AppActionEditor {
	return (
		typeof editor === "object" &&
		editor !== null &&
		"actionHandlers" in editor &&
		editor.actionHandlers instanceof Map
	);
}

function isThinkingHidden(ctx: ExtensionContext): boolean {
	return SettingsManager.create(ctx.cwd, getAgentDir(), {
		projectTrusted: ctx.isProjectTrusted(),
	}).getHideThinkingBlock();
}

type AnyToolDefinition = ToolDefinition<any, any, any>;
type ToolDisplayPolicy = "compact" | "full";

// Full file mutations remain visible. Read-only and shell-oriented tools use
// their built-in compact renderers until Ctrl+O expands the tool transcript.
const TOOL_DISPLAY_POLICY: Record<string, ToolDisplayPolicy> = {
	edit: "full",
	write: "full",
	bash: "compact",
	read: "compact",
	grep: "compact",
	find: "compact",
	ls: "compact",
};

function compactCall(
	definition: AnyToolDefinition,
	args: any,
	theme: any,
	context: any,
) {
	if (definition.name === "bash") {
		return new Text(
			theme.fg("toolTitle", theme.bold("Ran 1 shell command")),
			0,
			0,
		);
	}

	return (
		definition.renderCall?.(args, theme, context) ??
		new Text(theme.fg("toolTitle", definition.label), 0, 0)
	);
}

function compactTool(definition: AnyToolDefinition): AnyToolDefinition {
	const policy = TOOL_DISPLAY_POLICY[definition.name] ?? "compact";

	return {
		...definition,
		defaultExpanded: policy === "full",
		renderCall(args, theme, context) {
			const expanded = context.expanded;
			const renderContext = context;

			if (!expanded) return compactCall(definition, args, theme, renderContext);

			return (
				definition.renderCall?.(args, theme, renderContext) ??
				new Text(theme.fg("toolTitle", definition.label), 0, 0)
			);
		},
		renderResult(result, options, theme, context) {
			const expanded = options.expanded;
			const renderOptions = options;
			const renderContext = context;

			return (
				definition.renderResult?.(
					result,
					renderOptions,
					theme,
					renderContext,
				) ?? new Container()
			);
		},
	};
}

function registerCompactBuiltIns(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): void {
	const definitions = [
		createReadToolDefinition(ctx.cwd),
		createWriteToolDefinition(ctx.cwd),
		createEditToolDefinition(ctx.cwd),
		createBashToolDefinition(ctx.cwd),
		createGrepToolDefinition(ctx.cwd),
		createFindToolDefinition(ctx.cwd),
		createLsToolDefinition(ctx.cwd),
	];

	for (const definition of definitions) {
		pi.registerTool(compactTool(definition));
	}
}

export default function transcriptToggle(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || ctx.mode !== "tui") return;

		registerCompactBuiltIns(pi, ctx);

		const previousEditorFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor =
				previousEditorFactory?.(tui, theme, keybindings) ??
				new CustomEditor(tui, theme, keybindings);
			if (!hasAppActionHandlers(editor)) return editor;

			const handleInput = editor.handleInput.bind(editor);

			editor.handleInput = (data: string): void => {
				if (!keybindings.matches(data, "app.tools.expand")) {
					handleInput(data);
					return;
				}

				const toggleThinking = editor.actionHandlers.get("app.thinking.toggle");
				if (!toggleThinking) {
					handleInput(data);
					return;
				}

				const showDetails = !ctx.ui.getToolsExpanded();
				ctx.ui.setToolsExpanded(showDetails);

				if (isThinkingHidden(ctx) === showDetails) toggleThinking();
			};

			return editor;
		});
	});
}
