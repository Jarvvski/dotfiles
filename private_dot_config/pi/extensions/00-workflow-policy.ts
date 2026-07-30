import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const policyBin = join(homedir(), ".pi", "agent", "bin");
const pathParts = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
if (!pathParts.includes(policyBin))
	process.env.PATH = [policyBin, ...pathParts].join(delimiter);

const NOTCHBAR_HOST = process.env.NOTCHBAR_AGENTS_HOST ?? "127.0.0.1";
const NOTCHBAR_PORT = process.env.NOTCHBAR_AGENTS_PORT ?? "7823";
const IS_SUBAGENT = process.env.PI_SUBAGENT_CHILD === "1";

type ImageContent = { type: "image"; data: string; mimeType: string };
type ClipboardReaders = {
	readClipboardImage: () => Promise<{
		bytes: Uint8Array;
		mimeType: string;
	} | null>;
	readClipboardText: () => Promise<string | null>;
};

let clipboardReadersPromise: Promise<ClipboardReaders> | undefined;

function loadClipboardReaders(): Promise<ClipboardReaders> {
	clipboardReadersPromise ??= (async () => {
		const cliPath = realpathSync(process.argv[1]);
		const utilsDir = join(dirname(cliPath), "utils");
		const imageModule = await import(
			pathToFileURL(join(utilsDir, "clipboard-image.js")).href
		);
		const textModule = await import(
			pathToFileURL(join(utilsDir, "clipboard.js")).href
		);
		return {
			readClipboardImage: imageModule.readClipboardImage,
			readClipboardText: textModule.readClipboardText,
		};
	})();
	return clipboardReadersPromise;
}

function terminalName(): string {
	const raw = process.env.TERM_PROGRAM ?? "";
	const names: Record<string, string> = {
		"iTerm.app": "iTerm",
		Apple_Terminal: "Terminal",
		vscode: "VS Code",
		WarpTerminal: "Warp",
		ghostty: "Ghostty",
		Hyper: "Hyper",
		WezTerm: "WezTerm",
		kitty: "kitty",
		tabby: "Tabby",
		alacritty: "Alacritty",
	};
	return names[raw] ?? raw;
}

async function sendNotchbar(
	state: string,
	event: string,
	ctx: ExtensionContext,
	title = "",
): Promise<void> {
	if (IS_SUBAGENT) return;
	try {
		await fetch(`http://${NOTCHBAR_HOST}:${NOTCHBAR_PORT}/event`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				state,
				agent: "Pi",
				event,
				session_id: ctx.sessionManager.getSessionId(),
				cwd: ctx.cwd,
				title: title.trim().slice(0, 120),
				terminal: terminalName(),
				pid: process.pid,
			}),
			signal: AbortSignal.timeout(1000),
		});
	} catch {
		// NotchBar is optional and must never interfere with the agent.
	}
}

const PI_WORKFLOW_POLICY = `

Pi workflow policy:
- Never invoke Git directly. Use Jujutsu (jj) commands only. A Pi-local PATH guard blocks direct Git commands but allows Git subprocesses launched internally by jj and directly by GitHub CLI (gh).
- Do not create or use additional worktrees or workspaces unless the user explicitly asks. Never set pi-subagents worktree=true because that implementation invokes Git. If isolation is explicitly requested, stop and choose a Jujutsu-compatible approach with the user.
- Parallelize only read-only exploration, research, planning, and review. Use at most one source-editing worker at a time in the current workspace.
- The worker agent is the default source-editing subagent. Treat scout, researcher, planner, reviewer, context-builder, oracle, advisor, and delegate as read-only unless the user explicitly requests a different role and no concurrent writer is active.`;

export default function workflowPolicy(pi: ExtensionAPI) {
	let runFailed = false;
	let imageSequence = 0;
	const pendingImages = new Map<string, ImageContent>();

	pi.registerShortcut("ctrl+v", {
		description: "Paste an image as [Image #N], or paste clipboard text",
		handler: async (ctx) => {
			try {
				const readers = await loadClipboardReaders();
				const image = await readers.readClipboardImage();
				if (!image) {
					const text = await readers.readClipboardText();
					if (text) {
						ctx.ui.pasteToEditor(text);
						ctx.ui.setStatus("clipboard-paste-render", undefined);
					}
					return;
				}

				const editorText = ctx.ui.getEditorText();
				for (const label of pendingImages.keys()) {
					if (!editorText.includes(label)) pendingImages.delete(label);
				}
				if (pendingImages.size === 0) imageSequence = 0;

				const label = `[Image #${++imageSequence}]`;
				pendingImages.set(label, {
					type: "image",
					data: Buffer.from(image.bytes).toString("base64"),
					mimeType: image.mimeType,
				});
				ctx.ui.pasteToEditor(label);
				ctx.ui.setStatus("clipboard-paste-render", undefined);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					`Unable to paste clipboard content: ${message}`,
					"warning",
				);
			}
		},
	});

	pi.on("input", (event) => {
		if (pendingImages.size === 0) return;
		const attached = [...pendingImages.entries()]
			.filter(([label]) => event.text.includes(label))
			.map(([, image]) => image);
		pendingImages.clear();
		imageSequence = 0;
		if (attached.length === 0) return;
		return {
			action: "transform" as const,
			text: event.text,
			images: [...(event.images ?? []), ...attached],
		};
	});

	pi.registerCommand("clear", {
		description: "Alias for /new",
		handler: async (_args, ctx) => {
			await ctx.newSession();
		},
	});

	pi.registerCommand("exit", {
		description: "Gracefully exit Pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		runFailed = false;
		await sendNotchbar("Working", "UserPromptSubmit", ctx, event.prompt);
		return { systemPrompt: event.systemPrompt + PI_WORKFLOW_POLICY };
	});

	pi.on("agent_end", (event) => {
		const assistant = [...event.messages]
			.reverse()
			.find((message) => message.role === "assistant");
		runFailed =
			assistant?.role === "assistant" && assistant.stopReason === "error";
	});

	pi.on("session_start", async (_event, ctx) => {
		pendingImages.clear();
		imageSequence = 0;
		await sendNotchbar("Idle", "SessionStart", ctx);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		await sendNotchbar(
			"Idle",
			runFailed ? "Error" : "Stop",
			ctx,
			runFailed ? "Agent run failed" : "",
		);
	});

	pi.on("session_shutdown", async (event, ctx) => {
		if (event.reason === "quit") await sendNotchbar("Ended", "SessionEnd", ctx);
	});
}
