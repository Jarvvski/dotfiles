#!/usr/bin/env bun

/**
 * jj-pr-stack: A simple tool to manage stacked PRs with Jujutsu
 *
 * Updates PR body with stack navigation (no comments, no footer)
 */

import { $ } from "bun";

// Types
interface Bookmark {
  name: string;
  commitId: string;
  changeId: string;
  hasRemote: boolean;
}

interface StackEntry {
  bookmark: Bookmark;
  parent?: string; // parent bookmark name
  prNumber?: number;
  prUrl?: string;
}

interface PRInfo {
  number: number;
  url: string;
  body: string;
  head: string;
  base: string;
}

// GitHub API helpers using gh CLI
async function ghApi<T>(endpoint: string, method = "GET", data?: object): Promise<T> {
  const args = ["gh", "api", endpoint, "-X", method];
  if (data) {
    args.push("--input", "-");
    const proc = Bun.spawn(args, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin.write(JSON.stringify(data));
    proc.stdin.end();
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`gh api failed: ${stderr}`);
    }
    return JSON.parse(output);
  } else {
    const result = await $`gh api ${endpoint} -X ${method}`.text();
    return JSON.parse(result);
  }
}

async function getRepoInfo(): Promise<{ owner: string; repo: string }> {
  const remote = await $`git remote get-url origin`.text();
  const match = remote.trim().match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) throw new Error("Could not parse GitHub remote URL");
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

async function getDefaultBranch(): Promise<string> {
  const { owner, repo } = await getRepoInfo();
  const repoData = await ghApi<{ default_branch: string }>(`repos/${owner}/${repo}`);
  return repoData.default_branch;
}

async function findPRForBranch(branch: string): Promise<PRInfo | null> {
  const { owner, repo } = await getRepoInfo();
  try {
    const prs = await ghApi<PRInfo[]>(
      `repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`
    );
    if (prs.length > 0) {
      return prs[0];
    }
  } catch {
    // No PR found
  }
  return null;
}

async function createPR(
  head: string,
  base: string,
  title: string,
  body: string
): Promise<PRInfo> {
  const { owner, repo } = await getRepoInfo();
  return ghApi<PRInfo>(`repos/${owner}/${repo}/pulls`, "POST", {
    head,
    base,
    title,
    body,
  });
}

async function updatePR(prNumber: number, updates: { body?: string; base?: string }): Promise<void> {
  const { owner, repo } = await getRepoInfo();
  await ghApi(`repos/${owner}/${repo}/pulls/${prNumber}`, "PATCH", updates);
}

// JJ helpers
async function getBookmarks(): Promise<Bookmark[]> {
  // Get bookmarks that are between trunk and mine
  const template = `
    separate("\\t",
      name,
      commit_id.short(12),
      change_id.short(12),
      if(remote, "remote", "local")
    ) ++ "\\n"
  `.trim();

  let output: string;
  try {
    output = await $`jj bookmark list -r "mine() ~ trunk()" -T ${template}`.text();
  } catch {
    return [];
  }

  const bookmarks: Map<string, Bookmark> = new Map();

  for (const line of output.trim().split("\n")) {
    if (!line.trim()) continue;
    const [name, commitId, changeId, location] = line.split("\t");
    if (!name) continue;

    const existing = bookmarks.get(name);
    if (existing) {
      if (location === "remote") {
        existing.hasRemote = true;
      }
    } else {
      bookmarks.set(name, {
        name,
        commitId,
        changeId,
        hasRemote: location === "remote",
      });
    }
  }

  return Array.from(bookmarks.values());
}

async function getBookmarkStack(targetBookmark: string): Promise<string[]> {
  // Get all bookmarks in the path from trunk to target
  // Returns them in order from bottom (closest to trunk) to top
  const template = `
    bookmarks.map(|b| b.name() ++ "\\n")
  `.trim();

  let output: string;
  try {
    output = await $`jj log -r "trunk()::${targetBookmark} ~ trunk()" --no-graph -T ${template}`.text();
  } catch {
    return [targetBookmark];
  }

  const bookmarkNames = output
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .reverse(); // reverse to get bottom-to-top order

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of bookmarkNames) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  return result.length > 0 ? result : [targetBookmark];
}

function generateStackSection(
  stack: StackEntry[],
  currentBookmark: string
): string {
  const lines: string[] = ["## Stack"];

  // Add trunk at the bottom
  lines.push("");
  lines.push("**trunk**");

  // Add each bookmark in the stack
  for (const entry of stack) {
    const isCurrent = entry.bookmark.name === currentBookmark;
    if (entry.prUrl) {
      if (isCurrent) {
        lines.push(`↳ **${entry.bookmark.name}** ← this PR`);
      } else {
        lines.push(`↳ [${entry.bookmark.name}](${entry.prUrl})`);
      }
    } else {
      if (isCurrent) {
        lines.push(`↳ **${entry.bookmark.name}** ← this PR`);
      } else {
        lines.push(`↳ ${entry.bookmark.name}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

function updateBodyWithStack(existingBody: string, stackSection: string): string {
  // Remove existing stack section if present
  const stackRegex = /## Stack\n[\s\S]*?(?=\n## |\n*$)/;
  const cleanBody = existingBody.replace(stackRegex, "").trim();

  // Add new stack section at the end
  if (cleanBody) {
    return `${cleanBody}\n\n${stackSection}`;
  }
  return stackSection;
}

async function pushBookmark(bookmarkName: string): Promise<void> {
  console.log(`  Pushing ${bookmarkName}...`);
  await $`jj git push -b ${bookmarkName}`.quiet();
}

async function submit(targetBookmark: string, dryRun: boolean): Promise<void> {
  const bookmarks = await getBookmarks();
  const bookmarkMap = new Map(bookmarks.map((b) => [b.name, b]));

  if (!bookmarkMap.has(targetBookmark)) {
    console.error(`Bookmark '${targetBookmark}' not found`);
    console.error("Available bookmarks:", bookmarks.map((b) => b.name).join(", "));
    process.exit(1);
  }

  // Get the stack for this bookmark
  const stackNames = await getBookmarkStack(targetBookmark);
  console.log(`Stack: ${stackNames.join(" → ")}`);

  // Build stack entries
  const stack: StackEntry[] = [];
  for (const name of stackNames) {
    const bookmark = bookmarkMap.get(name);
    if (!bookmark) continue;

    const pr = await findPRForBranch(name);
    stack.push({
      bookmark,
      prNumber: pr?.number,
      prUrl: pr?.url,
    });
  }

  const defaultBranch = await getDefaultBranch();

  // Process each bookmark in the stack
  for (let i = 0; i < stack.length; i++) {
    const entry = stack[i];
    const baseBranch = i === 0 ? defaultBranch : stack[i - 1].bookmark.name;

    console.log(`\nProcessing ${entry.bookmark.name}...`);

    // Push the bookmark
    if (!dryRun) {
      await pushBookmark(entry.bookmark.name);
    } else {
      console.log(`  [dry-run] Would push ${entry.bookmark.name}`);
    }

    // Generate stack section for this PR
    const stackSection = generateStackSection(stack, entry.bookmark.name);

    if (entry.prNumber) {
      // Update existing PR
      console.log(`  Updating PR #${entry.prNumber}...`);
      if (!dryRun) {
        const pr = await findPRForBranch(entry.bookmark.name);
        if (pr) {
          const newBody = updateBodyWithStack(pr.body || "", stackSection);
          await updatePR(entry.prNumber, { body: newBody, base: baseBranch });
        }
      } else {
        console.log(`  [dry-run] Would update PR #${entry.prNumber}`);
        console.log(`  [dry-run] Base: ${baseBranch}`);
      }
    } else {
      // Create new PR
      console.log(`  Creating PR...`);
      const title = entry.bookmark.name;
      const body = stackSection;

      if (!dryRun) {
        const pr = await createPR(entry.bookmark.name, baseBranch, title, body);
        entry.prNumber = pr.number;
        entry.prUrl = pr.url;
        console.log(`  Created PR #${pr.number}: ${pr.url}`);
      } else {
        console.log(`  [dry-run] Would create PR: ${title}`);
        console.log(`  [dry-run] Base: ${baseBranch}`);
      }
    }
  }

  // Second pass: update all PRs with complete stack info (now that all PRs exist)
  if (!dryRun) {
    console.log("\nUpdating stack links...");
    for (const entry of stack) {
      if (entry.prNumber) {
        const stackSection = generateStackSection(stack, entry.bookmark.name);
        const pr = await findPRForBranch(entry.bookmark.name);
        if (pr) {
          const newBody = updateBodyWithStack(pr.body || "", stackSection);
          await updatePR(entry.prNumber, { body: newBody });
        }
      }
    }
  }

  console.log("\nDone!");
}

async function listStack(targetBookmark?: string): Promise<void> {
  const bookmarks = await getBookmarks();

  if (bookmarks.length === 0) {
    console.log("No bookmarks found between trunk and your changes");
    return;
  }

  if (targetBookmark) {
    const stackNames = await getBookmarkStack(targetBookmark);
    console.log(`Stack for ${targetBookmark}:`);
    console.log("  trunk");
    for (const name of stackNames) {
      const bookmark = bookmarks.find((b) => b.name === name);
      const remote = bookmark?.hasRemote ? " (pushed)" : "";
      const current = name === targetBookmark ? " ← target" : "";
      console.log(`  ↳ ${name}${remote}${current}`);
    }
  } else {
    console.log("Bookmarks:");
    for (const bookmark of bookmarks) {
      const remote = bookmark.hasRemote ? " (pushed)" : "";
      console.log(`  ${bookmark.name}${remote}`);
    }
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (command === "submit" || command === "s") {
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const bookmark = args.find((a) => !a.startsWith("-") && a !== "submit" && a !== "s");

  if (!bookmark) {
    console.error("Usage: jj-pr-stack submit <bookmark> [--dry-run]");
    process.exit(1);
  }

  await submit(bookmark, dryRun);
} else if (command === "list" || command === "ls" || !command) {
  const bookmark = args.find((a) => !a.startsWith("-") && a !== "list" && a !== "ls");
  await listStack(bookmark);
} else if (command === "help" || command === "-h" || command === "--help") {
  console.log(`jj-pr-stack - Manage stacked PRs with Jujutsu

Usage:
  jj-pr-stack [list] [bookmark]     List bookmarks or show stack for a bookmark
  jj-pr-stack submit <bookmark>     Push and create/update PRs for the stack
  jj-pr-stack submit <bookmark> -n  Dry run (show what would happen)

Options:
  -n, --dry-run    Show what would happen without making changes
  -h, --help       Show this help message
`);
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Run 'jj-pr-stack help' for usage");
  process.exit(1);
}
