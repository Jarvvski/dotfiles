---
name: review-pr
description: "Interactively address review comments on a GitHub PR. Use when the user says 'review-pr', 'review PR comments', 'address PR feedback', or provides a PR URL wanting to handle reviewer comments. Fetches unresolved comments (from bots and humans), presents multi-choice fix options per comment, and implements selected fixes."
---

# Review PR Comments

You are reviewing and addressing unresolved PR comments interactively. Follow these steps precisely.

## Plan Mode Behavior

Before Step 1, scan the current conversation for a `<system-reminder>` containing `Plan mode is active` or `Plan mode still active`. If present, you are in **plan mode** and MUST follow the plan-mode variants of Steps 6 and 7 below. The plan file path is given in the plan-mode system reminder (e.g. `/Users/jarvis/.claude/plans/<slug>.md`).

In plan mode:
- Steps 1-5 run unchanged (read-only `gh api`, `jq`, `Read`, `AskUserQuestion`).
- **Do not** call `Edit` on referenced source files.
- **Do not** call `gh api graphql` with `resolveReviewThread` or any other mutation.
- **Do not** commit or run `jj`/`git`.
- Append chosen fixes (with concrete diffs) to the plan file after each batch.
- End the turn by calling `ExitPlanMode` (never `AskUserQuestion` about plan approval).

Outside plan mode, follow Steps 6 and 7 as originally written.

## Step 1: Parse the PR URL

The user provides a PR URL or number as the argument.

- Full URL: extract `{owner}`, `{repo}`, and `{number}` from `https://github.com/{owner}/{repo}/pull/{number}`
- Bare number: use the current repo's remote (run `jj git remote list` or fall back to `git remote get-url origin`) to determine `{owner}/{repo}`
- If no argument is provided, use `AskUserQuestion` to ask for the PR URL

## Step 2: Verify `gh` authentication

Run `gh auth status` via Bash. If not authenticated, tell the user to run `gh auth login` and stop.

## Step 3: Fetch PR data

Run these two commands in parallel via Bash:

1. **Unresolved review threads** (inline) via GraphQL. Write the query to a temp file first (zsh escapes `!` in inline strings):

```bash
cat <<'GRAPHQL' > /tmp/gh-pr-threads.graphql
query($owner: String!, $repo: String!, $number: Int!, $cursor: String) { repository(owner: $owner, name: $repo) { pullRequest(number: $number) { reviewThreads(first: 100, after: $cursor) { nodes { id isResolved isOutdated path line originalLine startLine diffSide comments(first: 50) { nodes { body author { login } createdAt diffHunk url } } } pageInfo { hasNextPage endCursor } } } } }
GRAPHQL
gh api graphql -F owner='{owner}' -F repo='{repo}' -F number={number} -F query=@/tmp/gh-pr-threads.graphql
```

Pipe through `jq` to keep only unresolved threads:
```
jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
```

If `pageInfo.hasNextPage` is `true`, run a follow-up query passing `-F cursor='{endCursor}'` to fetch the next page. Repeat until `hasNextPage` is `false`. Concatenate all unresolved threads.

For each unresolved thread, extract: `id`, `isOutdated`, `path`, `line` (or `originalLine`), `diffSide`, and from `comments.nodes[0]` (the root comment): `body`, `author.login`, `createdAt`, `diffHunk`, `url`. Also note the total reply count (`comments.nodes | length - 1`) and last reply author/body if replies exist.

2. **Issue comments** (top-level): `gh api repos/{owner}/{repo}/issues/{number}/comments --paginate`

Use `jq` to extract: `id`, `body`, `user.login`, `created_at`, `html_url`.

## Step 4: Filter comments

Exclude comments (from both sources) that match ANY of these:

- Body is empty or whitespace-only
- Body is pure praise/acknowledgment: matches patterns like `LGTM`, `+1`, `looks good`, `nice`, `nit:` followed by nothing substantive, `ship it`

For review threads, only the root comment (`comments.nodes[0]`) is evaluated and presented. Replies within the thread provide context but are not separately triaged.

Comments from bots and humans are both included.

If zero actionable items remain after filtering, report "No unresolved review comments found" and stop.

## Step 5: Analyze and present comments in batches

**Sort all items by file path** so fixes are applied file-by-file, reducing context switching. Review threads are sorted by `path` then `line`. Issue comments (no file path) are placed at the end.

Process items in batches of up to 4 (matching the `AskUserQuestion` limit of 4 questions per call).

For each item in the batch:

1. **Read the referenced file** at the mentioned line(s) using the Read tool to understand the current code
2. **Analyze the comment** - determine what the reviewer is asking for (code change, question, style fix, etc.)
3. **Check for context hints**:
   - If the thread is marked `isOutdated`, prepend "[OUTDATED - code has changed since this comment]" to the question
   - If the thread has replies, append "Thread has N replies - last from {login}: '{body truncated to ~60 chars}'"
4. **Generate 1-3 fix options**, each with:
   - A short `label` (1-5 words) describing the fix
   - A `description` explaining what the fix does
   - A `preview` showing the proposed code change as a diff or code snippet
5. **Always include "Ignore"** as the last option with description "Skip this comment without changes"

Present the batch using `AskUserQuestion` with these settings per question:
- `header`: file basename + line number, max 12 chars (e.g., `utils.kt:42`, `README:15`). For issue comments with no file, use the author's login truncated to 12 chars.
- `question`: quote the reviewer's comment (truncated to ~100 chars if long), then ask "How would you like to address this?"
- `multiSelect`: `false`
- `options`: the fix options + Ignore

### Special cases

- **Comment references deleted/missing code**: only offer "Ignore" and "Reply explaining code was removed"
- **Comment is a question** (not requesting a change): offer "Add inline comment answering" (with preview of the answer), "Ignore"
- **Comment is ambiguous**: offer your best-guess fix, a conservative alternative, and "Ignore"

## Step 6 (default mode): Implement selected fixes

After the user selects options for a batch:

- Skip any selections of "Ignore"
- Group remaining fixes by file
- Apply changes using the Edit tool - make minimal, targeted edits
- Do **NOT** commit or create any VCS operations - the user manages version control with `jj`

**Resolve threads**: If any review threads (not issue comments) were addressed in this batch, collect their `id` values and ask the user via `AskUserQuestion`: "Resolve {N} addressed thread(s) on GitHub?" with options "Yes" and "No". If the user selects "Yes", resolve each thread:

**IMPORTANT**: zsh escapes `!` inside query strings (e.g. `ID!` becomes `ID\!`), causing GraphQL parse errors. Always write the query to a temp file via heredoc first, then reference it with `-F query=@file`:

```bash
cat <<'GRAPHQL' > /tmp/gh-resolve-thread.graphql
mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { isResolved } } }
GRAPHQL
gh api graphql -F threadId='{id}' -F query=@/tmp/gh-resolve-thread.graphql
```

The heredoc (with quoted delimiter `'GRAPHQL'`) prevents all shell interpolation. You only need to write the file once per session - reuse it for each thread by changing the `-F threadId=` value.

Then proceed to the next batch (repeat Steps 5-6) until all items are processed.

## Step 6 (plan mode): Append chosen fixes to the plan file

After each batch of `AskUserQuestion` responses, if plan mode is active:

- Skip any "Ignore" selections (note them for the summary).
- For each non-ignored selection, append a fix entry to the plan file using the `Write`/`Edit` tool on the **plan file only**. Do NOT call `Edit` on any referenced source file. Entry format:

  ````markdown
  ### Fix N: `{path}:{line}` - {short label}

  - **Comment by** `@{author}` ({url}) - {createdAt}
  - **Reviewer ask**: > {quoted body, trimmed to ~200 chars}
  - **Selected option**: {label}
  - **Thread id**: `{threadId}` (for post-execution resolution; omit for issue comments)
  - **Change**:

    ```{language}
    // before
    {1-3 lines of existing code}
    ```

    ```{language}
    // after
    {1-3 lines of proposed code}
    ```

  - **Notes** (optional): any caveats, conflicts, or follow-ups
  ````

- Do NOT ask "Resolve threads on GitHub?" in plan mode. Instead, maintain a running `## Threads to resolve after execution` section in the plan file and append each addressed thread id to it.
- Do NOT call `gh api graphql` with any mutation (e.g. `resolveReviewThread`). GraphQL queries for fetching are still fine.
- Proceed to the next batch (repeat Steps 5 and 6) until all items are processed.

## Step 7 (default mode): Summary

After all batches are processed, output a brief summary:

```
PR #{number} review complete:
- {N} threads reviewed
- {M} fixes applied
- {K} ignored
- {R} threads resolved on GitHub
- Files modified: {list of file paths}
```

## Step 7 (plan mode): Finalize plan and exit

Append a final summary block to the plan file:

    ## Summary
    - PR: {owner}/{repo}#{number} ({url})
    - Threads reviewed: {N}
    - Fixes to apply: {M}
    - Ignored: {K}
    - Threads to resolve on GitHub after execution: {R} (see list above)
    - Files to modify: {deduped list of paths}

    ## Execution notes
    - Apply fixes in the order listed (sorted by file path).
    - After all Edits, resolve the listed thread ids via the GraphQL mutation documented in Step 6 (default mode).
    - Do not commit; the user manages VCS with `jj`.

Then call `ExitPlanMode`. Do NOT print the summary as chat text and do NOT call `AskUserQuestion` asking for plan approval.

## Important constraints

- Never modify files that weren't referenced by a review comment
- Never commit, push, or run `jj`/`git` commands that modify history
- If a fix would conflict with another fix in the same batch (overlapping lines), warn the user and ask which to apply first
- Keep fix previews concise - show only the changed lines with 1-2 lines of context
- When running `gh api graphql` commands, use ONLY straight ASCII single quotes (') and double quotes ("). Never use curly/smart quotes - they cause GraphQL parse errors.
- **zsh `!` escaping**: zsh treats `!` as history expansion even inside some quoting contexts, turning `ID!` into `ID\!` which GraphQL rejects as `UNKNOWN_CHAR`. Always write GraphQL queries containing `!` to a temp file via a quoted heredoc (`cat <<'EOF'`) and reference with `-F query=@file`. This applies to both queries and mutations.
- In plan mode, never modify any file except the plan file given in the plan-mode system reminder.
- In plan mode, never call any `gh api graphql` mutation (e.g. `resolveReviewThread`). Fetches (queries) are fine.
- In plan mode, end the turn with `ExitPlanMode` once all batches are processed and the plan file is complete.
