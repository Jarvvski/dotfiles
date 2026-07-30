import {
	CustomEditor,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

type EditorWithInput = {
	getText(): string;
	setText(text: string): void;
	handleInput(data: string): void;
};

const BARE_COMMAND_ALIASES: Readonly<Record<string, string>> = {
	clear: "/clear",
	exit: "/exit",
};

function supportsInputAliases(editor: unknown): editor is EditorWithInput {
	return (
		typeof editor === "object" &&
		editor !== null &&
		"getText" in editor &&
		typeof editor.getText === "function" &&
		"setText" in editor &&
		typeof editor.setText === "function" &&
		"handleInput" in editor &&
		typeof editor.handleInput === "function"
	);
}

export default function commandAliases(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || ctx.mode !== "tui") return;

		const previousEditorFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor =
				previousEditorFactory?.(tui, theme, keybindings) ??
				new CustomEditor(tui, theme, keybindings);
			if (!supportsInputAliases(editor)) return editor;

			const handleInput = editor.handleInput.bind(editor);
			editor.handleInput = (data: string): void => {
				if (keybindings.matches(data, "tui.input.submit")) {
					const command = BARE_COMMAND_ALIASES[editor.getText()];
					if (command) editor.setText(command);
				}
				handleInput(data);
			};

			return editor;
		});
	});
}
