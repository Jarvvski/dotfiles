import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync as readFileSyncValue } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	CustomEditor,
	stripFrontmatter,
	type ExtensionAPI,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

type CustomEditorConstructorArgs = ConstructorParameters<typeof CustomEditor>;
type EditorTUI = CustomEditorConstructorArgs[0];
type PromptEditorTheme = CustomEditorConstructorArgs[1];

type SkillCommand = ReturnType<ExtensionAPI["getCommands"]>[number] & {
	source: "skill";
};

const MAX_HISTORY = 100;
const HISTORY_DIRECTORY = "prompt-history";
const MAX_SKILL_SUGGESTIONS = 20;
const SKILL_PREFIX = "skill:";
const SKILL_REFERENCE_PATTERN = /\$([a-z0-9][a-z0-9-]*)/g;
const STANDARD_SKILL_NAME_PATTERN = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

type RecordValue = Record<string, unknown>;
type ContentBlock = { type?: unknown; text?: unknown };
type HistoryContext = {
	sessionManager: { buildContextEntries(): readonly unknown[] };
};

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null;
}

let writeQueue = Promise.resolve();

function getHistoryPath(cwd: string): string {
	const agentDirectory =
		process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const cwdId = createHash("sha256").update(cwd).digest("hex");
	return join(agentDirectory, HISTORY_DIRECTORY, `${cwdId}.json`);
}

function normalizeHistory(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.flatMap((prompt) =>
			typeof prompt === "string" && prompt.trim() ? [prompt.trim()] : [],
		)
		.slice(0, MAX_HISTORY);
}

function readHistory(cwd: string): string[] {
	const historyPath = getHistoryPath(cwd);
	if (!existsSync(historyPath)) return [];

	try {
		const value: unknown = JSON.parse(readFileSyncValue(historyPath, "utf8"));
		return normalizeHistory(isRecord(value) ? value.prompts : undefined);
	} catch {
		return [];
	}
}

function getUserMessageText(message: unknown): string {
	if (!isRecord(message) || message.role !== "user") return "";
	if (typeof message.content === "string") return message.content.trim();
	if (!Array.isArray(message.content)) return "";
	return message.content
		.flatMap((block: ContentBlock) =>
			block?.type === "text" && typeof block.text === "string"
				? [block.text]
				: [],
		)
		.join("")
		.trim();
}

function getRenderedPrompts(ctx: HistoryContext): string[] {
	return ctx.sessionManager
		.buildContextEntries()
		.map((entry) =>
			getUserMessageText(isRecord(entry) ? entry.message : undefined),
		)
		.filter(Boolean);
}

function getSkillCommands(pi: ExtensionAPI): SkillCommand[] {
	return pi
		.getCommands()
		.filter((command): command is SkillCommand => command.source === "skill")
		.filter((command) =>
			STANDARD_SKILL_NAME_PATTERN.test(getSkillName(command)),
		);
}

function getSkillName(command: SkillCommand): string {
	return command.name.startsWith(SKILL_PREFIX)
		? command.name.slice(SKILL_PREFIX.length)
		: command.name;
}

function isEscaped(text: string, index: number): boolean {
	let backslashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) {
		backslashes++;
	}
	return backslashes % 2 === 1;
}

function hasTokenBoundaries(
	text: string,
	index: number,
	length: number,
): boolean {
	const previous = text[index - 1];
	const next = text[index + length];
	return (
		(!previous || !/[a-z0-9_]/i.test(previous)) &&
		(!next || !/[a-z0-9_-]/i.test(next))
	);
}

function findReferencedSkills(
	text: string,
	commands: SkillCommand[],
): SkillCommand[] {
	const commandsByName = new Map(
		commands.map((command) => [getSkillName(command), command]),
	);
	const referenced: SkillCommand[] = [];
	const seen = new Set<string>();
	for (const match of text.matchAll(SKILL_REFERENCE_PATTERN)) {
		const name = match[1];
		const index = match.index ?? 0;
		if (
			!name ||
			seen.has(name) ||
			isEscaped(text, index) ||
			!hasTokenBoundaries(text, index, match[0].length)
		) {
			continue;
		}

		const command = commandsByName.get(name);
		if (command) {
			seen.add(name);
			referenced.push(command);
		}
	}
	return referenced;
}

function highlightSkillReferences(
	line: string,
	skillNames: Set<string>,
	format: (reference: string) => string,
): string {
	return line.replace(
		SKILL_REFERENCE_PATTERN,
		(reference, name: string, offset: number) => {
			if (
				isEscaped(line, offset) ||
				!hasTokenBoundaries(line, offset, reference.length) ||
				!skillNames.has(name)
			) {
				return reference;
			}
			return format(reference);
		},
	);
}

function extractSkillToken(textBeforeCursor: string): string | undefined {
	const match = textBeforeCursor.match(/\$([a-z0-9-]*)$/i);
	if (!match) return undefined;

	const index = textBeforeCursor.length - match[0].length;
	if (isEscaped(textBeforeCursor, index)) return undefined;
	const previous = textBeforeCursor[index - 1];
	if (previous && /[a-z0-9_]/i.test(previous)) return undefined;
	return match[1];
}

function formatSkillItem(command: SkillCommand): AutocompleteItem {
	const name = getSkillName(command);
	return {
		value: `$${name}`,
		label: `$${name}`,
		description: command.description,
	};
}

function createSkillAutocompleteProvider(
	pi: ExtensionAPI,
	current: AutocompleteProvider,
): AutocompleteProvider {
	return {
		triggerCharacters: ["$"],
		getSuggestions(
			lines,
			cursorLine,
			cursorCol,
			options,
		): Promise<AutocompleteSuggestions | null> {
			const currentLine = lines[cursorLine] ?? "";
			const token = extractSkillToken(currentLine.slice(0, cursorCol));
			if (token === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const commands = getSkillCommands(pi);
			const matches = token
				? fuzzyFilter(
						commands,
						token,
						(command) =>
							`${getSkillName(command)} ${command.description ?? ""}`,
					)
				: commands;
			const items = matches
				.slice(0, MAX_SKILL_SUGGESTIONS)
				.map(formatSkillItem);
			if (options.signal.aborted || items.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return Promise.resolve({
				items,
				prefix: `$${token}`,
			});
		},

		applyCompletion: current.applyCompletion.bind(current),

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return (
				current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
				true
			);
		},
	};
}

type LoadedSkillBlock = {
	name: string;
	content: string;
};

type SkillLoadError = {
	name: string;
	message: string;
};

function buildSkillBlocks(commands: SkillCommand[]): {
	blocks: LoadedSkillBlock[];
	errors: SkillLoadError[];
} {
	const blocks: LoadedSkillBlock[] = [];
	const errors: SkillLoadError[] = [];
	for (const command of commands) {
		const name = getSkillName(command);
		try {
			const filePath = command.sourceInfo.path;
			const baseDir = dirname(filePath);
			const body = stripFrontmatter(readFileSyncValue(filePath, "utf8")).trim();
			blocks.push({
				name,
				content: `<skill name="${name}" location="${filePath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`,
			});
		} catch (error) {
			errors.push({
				name,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return { blocks, errors };
}

async function persistPrompt(cwd: string, prompt: string): Promise<void> {
	const trimmed = prompt.trim();
	if (!trimmed || trimmed === "/clear" || trimmed === "/new") return;

	writeQueue = writeQueue
		.then(async () => {
			const prompts = readHistory(cwd);
			if (prompts[0] === trimmed) return;

			const historyPath = getHistoryPath(cwd);
			await mkdir(dirname(historyPath), { recursive: true });
			const nextPrompts = [trimmed, ...prompts].slice(0, MAX_HISTORY);
			const temporaryPath = `${historyPath}.${process.pid}.${Date.now()}.tmp`;
			await writeFile(
				temporaryPath,
				JSON.stringify({ cwd, prompts: nextPrompts }) + "\n",
				{
					encoding: "utf8",
					mode: 0o600,
				},
			);
			await rename(temporaryPath, historyPath);
		})
		.catch(() => undefined);

	await writeQueue;
}

class PromptHistoryEditor extends CustomEditor {
	private startupDuplicateCounts: Map<string, number>;
	getSkillNames: () => string[] = () => [];
	getTheme: () => Theme | undefined = () => undefined;

	constructor(
		tui: EditorTUI,
		theme: PromptEditorTheme,
		keybindings: KeybindingsManager,
		history: string[],
		renderedPrompts: string[],
	) {
		super(tui, theme, keybindings);

		for (let index = history.length - 1; index >= 0; index--) {
			super.addToHistory(history[index]);
		}

		const persistentCounts = new Map<string, number>();
		for (const prompt of history) {
			persistentCounts.set(prompt, (persistentCounts.get(prompt) ?? 0) + 1);
		}
		this.startupDuplicateCounts = new Map();
		for (const prompt of renderedPrompts) {
			const count = persistentCounts.get(prompt) ?? 0;
			if (count > 0) {
				persistentCounts.set(prompt, count - 1);
				this.startupDuplicateCounts.set(
					prompt,
					(this.startupDuplicateCounts.get(prompt) ?? 0) + 1,
				);
			}
		}
	}

	override addToHistory(text: string): void {
		const trimmed = text.trim();
		const duplicateCount = this.startupDuplicateCounts.get(trimmed) ?? 0;
		if (duplicateCount > 0) {
			if (duplicateCount === 1) this.startupDuplicateCounts.delete(trimmed);
			else this.startupDuplicateCounts.set(trimmed, duplicateCount - 1);
			return;
		}
		super.addToHistory(text);
	}

	override render(width: number): string[] {
		const skillNames = new Set(this.getSkillNames());
		const theme = this.getTheme();
		if (skillNames.size === 0 || !theme) return super.render(width);

		return super
			.render(width)
			.map((line) =>
				highlightSkillReferences(line, skillNames, (reference) =>
					theme.bold(theme.fg("accent", reference)),
				),
			);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) =>
			createSkillAutocompleteProvider(pi, current),
		);

		if (!ctx.hasUI || ctx.mode !== "tui") return;

		const history = readHistory(ctx.cwd);
		const renderedPrompts =
			event.reason === "reload" ? [] : getRenderedPrompts(ctx);
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor = new PromptHistoryEditor(
				tui,
				theme,
				keybindings,
				history,
				renderedPrompts,
			);
			editor.getSkillNames = () => getSkillCommands(pi).map(getSkillName);
			editor.getTheme = () => ctx.ui.theme;
			return editor;
		});
	});

	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return;
		await persistPrompt(ctx.cwd, event.text);
	});

	pi.on("before_agent_start", (event, ctx) => {
		const referenced = findReferencedSkills(event.prompt, getSkillCommands(pi));
		if (referenced.length === 0) return;

		const { blocks, errors } = buildSkillBlocks(referenced);
		if (errors.length > 0 && ctx.hasUI) {
			ctx.ui.notify(
				`Unable to load referenced skill${errors.length === 1 ? "" : "s"}: ${errors
					.map((error) => `${error.name}: ${error.message}`)
					.join("; ")}`,
				"error",
			);
		}
		if (blocks.length === 0) return;

		const names = blocks.map((block) => block.name).join(", ");
		const instructions = [
			`The user explicitly invoked these skills for this turn: ${names}.`,
			"Follow every invoked skill below. The user's original $skill-name references remain in their prompt.",
			...blocks.map((block) => block.content),
		].join("\n\n");

		return {
			systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
		};
	});
}
