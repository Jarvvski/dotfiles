import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	archiveMemory,
	containsSensitiveContent,
	createMemory,
	ensureMemoryDirectories,
	findProjectIdentity,
	getMemory,
	listMemories,
	purgeMemory,
	restoreMemory,
	validateMemoryInput,
	type ProjectIdentity,
} from "./store.ts";
import {
	ensureQmdCollections,
	formatInjection,
	searchMemories,
	type ExecFn,
} from "./search.ts";

const tempDirectories: string[] = [];

async function fixture(): Promise<{ root: string; project: ProjectIdentity }> {
	const root = await mkdtemp("/tmp/pi-memory-test-");
	tempDirectories.push(root);
	const projectRoot = join(root, "repo");
	await writeFile(join(root, "marker"), "", "utf8");
	await mkdir(join(projectRoot, ".jj"), { recursive: true });
	const project = await findProjectIdentity(projectRoot);
	await ensureMemoryDirectories(root, project);
	return { root, project };
}

afterEach(async () => {
	while (tempDirectories.length)
		await rm(tempDirectories.pop()!, { recursive: true, force: true });
});

describe("memory storage", () => {
	test("keeps global and project memories isolated and round-trippable", async () => {
		const { root, project } = await fixture();
		const global = await createMemory(root, project, {
			scope: "global",
			title: "Commit style",
			text: "Use conventional commits",
			tags: ["workflow"],
		});
		const local = await createMemory(root, project, {
			scope: "project",
			title: "Test command",
			text: "Run bun test",
			tags: ["testing"],
		});

		assert.match(global.id, /^mem-[0-9a-f]{16}$/);
		assert.deepEqual(
			(await listMemories(root, "global", project)).map((item) => item.id),
			[global.id],
		);
		assert.deepEqual(
			(await listMemories(root, "project", project)).map((item) => item.id),
			[local.id],
		);
		assert.equal(
			(await getMemory(root, project, local.id))?.text,
			"Run bun test",
		);
	});

	test("archives, restores, and purges without exposing archived records", async () => {
		const { root, project } = await fixture();
		const record = await createMemory(root, project, {
			scope: "project",
			title: "Temporary",
			text: "Do not recall this",
		});
		await archiveMemory(root, project, record.id);
		assert.equal(await getMemory(root, project, record.id), undefined);
		assert.deepEqual(
			(await listMemories(root, "both", project, "archive")).map(
				(item) => item.id,
			),
			[record.id],
		);
		await restoreMemory(root, project, record.id);
		assert.equal(
			(await getMemory(root, project, record.id))?.location,
			"active",
		);
		await archiveMemory(root, project, record.id);
		await purgeMemory(root, project, record.id);
		assert.equal(
			(await listMemories(root, "both", project, "archive")).length,
			0,
		);
	});

	test("rejects likely secrets and malformed memory input", () => {
		assert.equal(
			containsSensitiveContent("Authorization: Bearer abcdefghijklmnop"),
			true,
		);
		assert.equal(
			validateMemoryInput({ scope: "project", title: "", text: "x" }),
			"title is required",
		);
		assert.equal(
			validateMemoryInput({
				scope: "project",
				title: "Okay",
				text: "A safe note",
			}),
			undefined,
		);
	});
});

describe("memory retrieval", () => {
	test("uses lexical results when qmd is unavailable", async () => {
		const { root, project } = await fixture();
		const record = await createMemory(root, project, {
			scope: "project",
			title: "Database choice",
			text: "PostgreSQL is the selected database",
		});
		const results = await searchMemories(
			root,
			project,
			"database",
			"project",
			async () => ({ stdout: "", stderr: "not found", code: 1 }),
		);
		assert.equal(results[0]?.record.id, record.id);
		assert.equal(results[0]?.source, "lexical");
	});

	test("merges a valid qmd hit only when it points to a known active file", async () => {
		const { root, project } = await fixture();
		const record = await createMemory(root, project, {
			scope: "global",
			title: "Editor",
			text: "Use vim",
		});
		const exec: ExecFn = async (_command, args) => {
			if (args.includes("collection"))
				return { stdout: "", stderr: "", code: 0 };
			return {
				stdout: JSON.stringify([
					{ filepath: record.path, score: 1, snippet: "Use vim" },
				]),
				stderr: "",
				code: 0,
			};
		};
		const results = await searchMemories(
			root,
			project,
			"editor vim",
			"global",
			exec,
		);
		assert.equal(results[0]?.source, "qmd");
		assert.equal(results[0]?.score, 1);
	});

	test("keeps injection bounded and marks it untrusted", () => {
		const record = {
			id: "mem-0123456789abcdef",
			scope: "project" as const,
			title: "A",
			text: "x".repeat(5_000),
			tags: [],
			createdAt: "2026-01-01",
			updatedAt: "2026-01-01",
			path: "/tmp/a.md",
			location: "active" as const,
		};
		const injection = formatInjection([
			{ record, score: 1, snippet: "x".repeat(5_000), source: "lexical" },
		]);
		assert.match(injection, /untrusted="true"/);
		assert.ok(injection.length <= 4_000 + 80);
	});

	test("can initialize two qmd collections without touching the default index", async () => {
		const { root, project } = await fixture();
		const calls: string[][] = [];
		const exec: ExecFn = async (_command, args) => {
			calls.push(args);
			return args.includes("show")
				? { stdout: "", stderr: "missing", code: 1 }
				: { stdout: "added", stderr: "", code: 0 };
		};
		const result = await ensureQmdCollections(root, project, exec);
		assert.equal(result.available, true);
		assert.equal(
			calls.some(
				(args) =>
					args.includes("--index") && args.includes("pi-managed-memory"),
			),
			true,
		);
		assert.equal(
			calls.some((args) => args.includes("collection") && args.includes("add")),
			true,
		);
	});
});
