import { createHash, randomBytes } from "node:crypto";
import {
	access,
	mkdir,
	readdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type MemoryScope = "global" | "project";
export type MemoryLocation = "active" | "archive";

export interface MemoryRecord {
	id: string;
	scope: MemoryScope;
	title: string;
	text: string;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	path: string;
	location: MemoryLocation;
}

export interface MemoryInput {
	scope: MemoryScope;
	title: string;
	text: string;
	tags?: string[];
}

export interface ProjectIdentity {
	root: string;
	key: string;
	label: string;
}

const MAX_TITLE_LENGTH = 160;
const MAX_TEXT_LENGTH = 16_000;
const MAX_TAGS = 12;
const ID_PATTERN = /^mem-[0-9a-f]{16}$/;
const SENSITIVE_PATTERNS = [
	/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{12,}/i,
	/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
	/\bBearer\s+[A-Za-z0-9._~+\-/]+=*/i,
	/\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/i,
	/(?:^|\n)\s*[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD)\s*=\s*\S+/,
];

function cleanText(value: string, max: number): string {
	return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function cleanTags(tags: string[] | undefined): string[] {
	return [
		...new Set(
			(tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
		),
	].slice(0, MAX_TAGS);
}

function yamlScalar(value: string): string {
	return JSON.stringify(value);
}

function parseScalar(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed.slice(1, -1);
		}
	}
	return trimmed;
}

function serialize(record: Omit<MemoryRecord, "path" | "location">): string {
	const tags = record.tags.length
		? `[${record.tags.map(yamlScalar).join(", ")}]`
		: "[]";
	return [
		"---",
		`id: ${record.id}`,
		`scope: ${record.scope}`,
		`title: ${yamlScalar(record.title)}`,
		`tags: ${tags}`,
		`createdAt: ${record.createdAt}`,
		`updatedAt: ${record.updatedAt}`,
		"---",
		"",
		record.text,
		"",
	].join("\n");
}

function parseTags(value: string): string[] {
	try {
		const parsed = JSON.parse(value.replace(/^\[/, "[").replace(/\]$/, "]"));
		return Array.isArray(parsed)
			? cleanTags(
					parsed.filter((item): item is string => typeof item === "string"),
				)
			: [];
	} catch {
		return value
			.replace(/^\[|\]$/g, "")
			.split(",")
			.map((item) => parseScalar(item))
			.filter(Boolean)
			.slice(0, MAX_TAGS);
	}
}

function parseMemory(
	content: string,
	filePath: string,
	location: MemoryLocation,
): MemoryRecord | undefined {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) return undefined;
	const end = normalized.indexOf("\n---\n", 4);
	if (end < 0) return undefined;
	const metadata = new Map<string, string>();
	for (const line of normalized.slice(4, end).split("\n")) {
		const separator = line.indexOf(":");
		if (separator > 0)
			metadata.set(
				line.slice(0, separator).trim(),
				line.slice(separator + 1).trim(),
			);
	}
	const id = metadata.get("id") ?? "";
	const scope = metadata.get("scope");
	const title = metadata.get("title");
	const createdAt = metadata.get("createdAt");
	const updatedAt = metadata.get("updatedAt");
	if (
		!ID_PATTERN.test(id) ||
		(scope !== "global" && scope !== "project") ||
		!title ||
		!createdAt ||
		!updatedAt
	)
		return undefined;
	const text = normalized.slice(end + "\n---\n".length).trim();
	return {
		id,
		scope,
		title: cleanText(parseScalar(title), MAX_TITLE_LENGTH),
		text: cleanText(text, MAX_TEXT_LENGTH),
		tags: parseTags(metadata.get("tags") ?? "[]"),
		createdAt,
		updatedAt,
		path: filePath,
		location,
	};
}

function slug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "project"
	);
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export async function findProjectIdentity(
	cwd: string,
): Promise<ProjectIdentity> {
	let current = resolve(cwd);
	while (true) {
		if (
			(await directoryExists(join(current, ".jj"))) ||
			(await directoryExists(join(current, ".git")))
		) {
			const label = current.split(sep).filter(Boolean).at(-1) ?? "project";
			const digest = createHash("sha256")
				.update(current)
				.digest("hex")
				.slice(0, 12);
			return { root: current, key: `${slug(label)}-${digest}`, label };
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const absolute = resolve(cwd);
	const label = absolute.split(sep).filter(Boolean).at(-1) ?? "project";
	const digest = createHash("sha256")
		.update(absolute)
		.digest("hex")
		.slice(0, 12);
	return { root: absolute, key: `${slug(label)}-${digest}`, label };
}

export function getMemoryRoot(): string {
	return join(getAgentDir(), "memory");
}

export function getScopeDirectory(
	root: string,
	scope: MemoryScope,
	project: ProjectIdentity,
	location: MemoryLocation,
): string {
	return scope === "global"
		? join(root, "global", location)
		: join(root, "projects", project.key, location);
}

function fileName(id: string): string {
	if (!ID_PATTERN.test(id)) throw new Error("Invalid memory id");
	return `${id}.md`;
}

function assertInside(base: string, target: string): void {
	const resolvedBase = resolve(base);
	const resolvedTarget = resolve(target);
	if (
		resolvedTarget !== resolvedBase &&
		!resolvedTarget.startsWith(`${resolvedBase}${sep}`)
	)
		throw new Error("Memory path escaped its store");
}

async function atomicWrite(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
	try {
		await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
		await rename(temporary, path);
	} finally {
		await unlink(temporary).catch(() => undefined);
	}
}

export function containsSensitiveContent(text: string): boolean {
	return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateMemoryInput(input: MemoryInput): string | undefined {
	if (input.scope !== "global" && input.scope !== "project")
		return "scope must be global or project";
	if (!cleanText(input.title, MAX_TITLE_LENGTH)) return "title is required";
	if (!cleanText(input.text, MAX_TEXT_LENGTH)) return "text is required";
	if (input.title.length > MAX_TITLE_LENGTH)
		return `title exceeds ${MAX_TITLE_LENGTH} characters`;
	if (input.text.length > MAX_TEXT_LENGTH)
		return `text exceeds ${MAX_TEXT_LENGTH} characters`;
	if (containsSensitiveContent(`${input.title}\n${input.text}`))
		return "memory appears to contain a credential or secret";
	return undefined;
}

async function listDirectory(
	path: string,
	location: MemoryLocation,
): Promise<MemoryRecord[]> {
	const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
	const records: MemoryRecord[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const filePath = join(path, entry.name);
		const parsed = parseMemory(
			await readFile(filePath, "utf8").catch(() => ""),
			filePath,
			location,
		);
		if (parsed) records.push(parsed);
	}
	return records;
}

export async function listMemories(
	root: string,
	scope: MemoryScope | "both",
	project: ProjectIdentity,
	location: MemoryLocation = "active",
): Promise<MemoryRecord[]> {
	const scopes: MemoryScope[] =
		scope === "both" ? ["global", "project"] : [scope];
	const records: MemoryRecord[] = [];
	for (const currentScope of scopes) {
		const directory = getScopeDirectory(root, currentScope, project, location);
		assertInside(root, directory);
		records.push(...(await listDirectory(directory, location)));
	}
	return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createMemory(
	root: string,
	project: ProjectIdentity,
	input: MemoryInput,
): Promise<MemoryRecord> {
	const error = validateMemoryInput(input);
	if (error) throw new Error(error);
	const now = new Date().toISOString();
	const id = `mem-${randomBytes(8).toString("hex")}`;
	const directory = getScopeDirectory(root, input.scope, project, "active");
	const path = join(directory, fileName(id));
	assertInside(root, path);
	const record = {
		id,
		scope: input.scope,
		title: cleanText(input.title, MAX_TITLE_LENGTH),
		text: cleanText(input.text, MAX_TEXT_LENGTH),
		tags: cleanTags(input.tags),
		createdAt: now,
		updatedAt: now,
	};
	await atomicWrite(path, serialize(record));
	return { ...record, path, location: "active" };
}

export async function updateMemory(
	root: string,
	project: ProjectIdentity,
	id: string,
	input: Partial<Pick<MemoryInput, "title" | "text" | "tags">>,
): Promise<MemoryRecord> {
	const current = await getMemory(root, project, id, "active");
	if (!current) throw new Error(`Memory ${id} not found`);
	const nextInput: MemoryInput = {
		scope: current.scope,
		title: input.title ?? current.title,
		text: input.text ?? current.text,
		tags: input.tags ?? current.tags,
	};
	const error = validateMemoryInput(nextInput);
	if (error) throw new Error(error);
	const record = {
		id: current.id,
		scope: current.scope,
		title: cleanText(nextInput.title, MAX_TITLE_LENGTH),
		text: cleanText(nextInput.text, MAX_TEXT_LENGTH),
		tags: cleanTags(nextInput.tags),
		createdAt: current.createdAt,
		updatedAt: new Date().toISOString(),
	};
	await atomicWrite(current.path, serialize(record));
	return { ...record, path: current.path, location: "active" };
}

export async function getMemory(
	root: string,
	project: ProjectIdentity,
	id: string,
	location: MemoryLocation = "active",
): Promise<MemoryRecord | undefined> {
	if (!ID_PATTERN.test(id)) return undefined;
	const locations: Array<[MemoryScope, ProjectIdentity]> = [
		["global", project],
		["project", project],
	];
	for (const [scope, identity] of locations) {
		const path = join(
			getScopeDirectory(root, scope, identity, location),
			fileName(id),
		);
		assertInside(root, path);
		const record = parseMemory(
			await readFile(path, "utf8").catch(() => ""),
			path,
			location,
		);
		if (record) return record;
	}
	return undefined;
}

export async function archiveMemory(
	root: string,
	project: ProjectIdentity,
	id: string,
): Promise<MemoryRecord> {
	const current = await getMemory(root, project, id, "active");
	if (!current) throw new Error(`Memory ${id} not found`);
	const destination = join(
		getScopeDirectory(root, current.scope, project, "archive"),
		fileName(id),
	);
	assertInside(root, destination);
	await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
	await rename(current.path, destination);
	return { ...current, path: destination, location: "archive" };
}

export async function restoreMemory(
	root: string,
	project: ProjectIdentity,
	id: string,
): Promise<MemoryRecord> {
	const current = await getMemory(root, project, id, "archive");
	if (!current) throw new Error(`Archived memory ${id} not found`);
	const destination = join(
		getScopeDirectory(root, current.scope, project, "active"),
		fileName(id),
	);
	assertInside(root, destination);
	await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
	await rename(current.path, destination);
	return { ...current, path: destination, location: "active" };
}

export async function purgeMemory(
	root: string,
	project: ProjectIdentity,
	id: string,
): Promise<void> {
	const current = await getMemory(root, project, id, "archive");
	if (!current) throw new Error(`Archived memory ${id} not found`);
	assertInside(root, current.path);
	await unlink(current.path);
}

export async function ensureMemoryDirectories(
	root: string,
	project: ProjectIdentity,
): Promise<void> {
	for (const scope of ["global", "project"] as const) {
		for (const location of ["active", "archive"] as const) {
			const path = getScopeDirectory(root, scope, project, location);
			assertInside(root, path);
			await mkdir(path, { recursive: true, mode: 0o700 });
		}
	}
	await stat(root).catch(() => mkdir(root, { recursive: true, mode: 0o700 }));
}

export function getMemoryFilePath(record: MemoryRecord): string {
	if (!isAbsolute(record.path)) throw new Error("Memory path must be absolute");
	return record.path;
}
