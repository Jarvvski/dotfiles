---
name: land
description: Land the current jj change by following repository-specific landing instructions when present, otherwise describe it and create an adam/-prefixed bookmark. The exact `$land` invocation also pushes the bookmark and opens a ready-for-review PR in any repository; it never merges. Use when the user says "land", "land this", "land this commit/change", or invokes /land.
metadata:
  safety:
    explicit-invocation-grants:
      - vcs.push
      - github.pull-request.create
    never-grants:
      - github.pull-request.merge
---

# Landing a jj commit

Skills may declare Safety Guard capabilities in frontmatter. The exact `$land` invocation is an explicit user invocation and grants this skill's declared capabilities for the current landing workflow only.

## 0. Prefer repository-specific landing instructions

Before acting, read the repository's instruction files, including applicable `AGENTS.md` and
`CLAUDE.md` files. If they define a landing workflow, follow that workflow instead of this one,
including its revision, verification, description, bookmark, and stopping rules. Do not combine the
repository workflow with this fallback unless the repository explicitly requires it.

Only when the repository has no landing instructions, run the fallback below end-to-end without
confirmation: describe → bookmark → push + PR when `$land` or the repository-specific rules
authorize remote actions. NEVER use `git` commands - jj only, even in colocated repos.

## Remote-action authorization

The exact user invocation `$land` authorizes the remote half of this workflow in any repository:
after describe + bookmark, push the bookmark and open the PR per step 4. This authorization does
not include merging, auto-merge, merge queues, or unrelated remote mutations.

For plain `land`, natural-language landing requests, and `/land`, follow the repository-specific
rules below. In the `ameba/mono` repository, `origin` resolving to `AmebaAI/mono` authorizes the
remote half as a repository-specific exception. Everywhere else, local jj operations are the
fallback unless the user's current request explicitly asks to push or open a PR.

## Absolute stopping rule

Landing never authorizes merging. NEVER run `gh pr merge` or any equivalent command as part of
landing. NEVER merge a PR, enable auto-merge, enqueue it in a merge queue, or request a
squash/rebase/merge. Merge only when the user makes a separate, explicit merge request after the PR
exists.

## 1. Pick the target revision

Use `@` if it has changes, otherwise `@-`:

```bash
jj log -r @ --no-graph -T 'if(empty, "@-", "@")'
```

Call the result `$REV`. Sanity-check with `jj diff -r "$REV" --stat`. If the target
is also empty, or already sits on a pushed bookmark, stop and ask instead of guessing.

## 2. Describe

Read the diff (`jj diff -r "$REV"`, stat first for large changes) and write:

- **Subject**: short imperative oneline. No conventional-commit prefixes (`feat:`/`fix:`/`chore:`).
- **Body**: a short paragraph - what changed, why, anything non-obvious.

```bash
jj describe -r "$REV" -m "Subject line here" -m "Body paragraph explaining what changed and why."
```

Never add `Co-Authored-By` or any Claude/Anthropic attribution trailer.

## 3. Bookmark

Slugify 3-4 distinctive keywords from the subject: drop filler words (on/a/the/for/with),
kebab-case, prefix `adam/`.

> "reconcile party matches on a normalised probe" → `adam/reconcile-party-matches`

```bash
jj bookmark create adam/<slug> -r "$REV"
```

## 4. Push and PR

Run this step when the exact user invocation was `$land`, or when the repository-specific rules
above authorize remote actions. Verify the repository before pushing. To push and open the PR:

```bash
jj git push -b adam/<slug>
```

`gh` cannot auto-detect the repo in jj workspaces - always resolve it and pass `-R`:

```bash
REPO=$(jj git remote list | awk '/^origin/ {print $2}' | sed -E 's#.*[:/]([^/]+/[^/]+)\.git$#\1#')
gh pr create -R "$REPO" --head adam/<slug> --title "<subject line>" --body "<one short paragraph>"
```

- PR is ready for review (not draft), base = default branch.
- Body: one short paragraph in prose. No templated Summary/Test Plan/Root Cause sections.
- Finish by reporting the PR URL. Without explicit remote authorization, report the local landing
  result and bookmark name.

## 5. Post-landing cleanliness check

After the final local landing operation, including any repository-specific `jj new`, verify that the
working copy is clean:

```bash
jj status
```

Do not report landing as complete if `jj status` shows changes. Inspect the diff and determine
whether an editor, format-on-save action, or formatter using a different toolchain changed files
after landing. Do not silently fold those changes into the landed revision.

For repositories with a formatter, run its non-mutating check as the final verification, for example:

```bash
cargo fmt --all -- --check
```

Run mutating formatters before the landing operation, not after it. When a repository pins its
formatter through mise or another toolchain manager, use that pinned formatter consistently in the
editor and command line. A clean post-landing `jj status` is required before reporting success.
