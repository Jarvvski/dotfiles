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

function compactCall(
	definition: AnyToolDefinition,
	args: any,
	theme: any,
	context: any,
) {
	if (definition.name !== "write" && definition.name !== "edit") {
		return (
			definition.renderCall?.(args, theme, context) ??
			new Text(theme.fg("toolTitle", definition.label), 0, 0)
		);
	}

	const path = args.path ?? args.file_path ?? "...";
	return new Text(
		`${theme.fg("toolTitle", theme.bold(definition.name))} ${theme.fg("accent", path)}`,
		0,
		0,
	);
}

function compactTool(definition: AnyToolDefinition): AnyToolDefinition {
	return {
		...definition,
		renderCall(args, theme, context) {
			if (context.expanded) {
				return (
					definition.renderCall?.(args, theme, context) ??
					new Text(theme.fg("toolTitle", definition.label), 0, 0)
				);
			}
			return compactCall(definition, args, theme, context);
		},
		renderResult(result, options, theme, context) {
			if (!options.expanded && !context.isError) return new Container();
			return (
				definition.renderResult?.(result, options, theme, context) ??
				new Container()
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
		ctx.ui.setToolsExpanded(false);

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
