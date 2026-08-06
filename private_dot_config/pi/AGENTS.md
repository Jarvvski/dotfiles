# User Preferences

## CRITICAL
- NEVER add `Co-Authored-By: Claude ...` (or any Claude/Anthropic co-author or attribution trailer) to commits, commit messages, PR bodies, or any file. No exceptions.

## General Behavior
- Do what has been asked; nothing more, nothing less.
- NEVER create files unless absolutely necessary. Prefer editing existing files.
- NEVER proactively create documentation files (*.md) or README files.
- NEVER save working files, tests, or docs to the project root folder.
- NEVER use em-dashes or en-dashes. Always use a simple hyphen (-).
- CLI commands as a single line. Never use backslash line continuations.

## Planning & Assumptions
- Do NOT assume requirements, architecture, or API design. Ask clarifying questions before implementing.
- For Kotlin interfaces, public APIs, method signatures, DTOs, or data contracts: ALWAYS confirm design before writing code.
- Prefer one round of targeted questions over code that might need rewriting.
- When existing code is contradictory or the prompt is ambiguous, ask before implementing.

## Version Control: jj (Jujutsu), NOT git
- **NEVER** use `git` commands - even in colocated repos, git can corrupt jj's operation log.
- jj has NO staging area - all changes auto-tracked. Working copy is always a commit.
- Key mappings: `git add` not needed, `git push` -> `jj git push`, `git branch` -> `jj bookmark`, `git checkout` -> `jj new`/`jj edit`, `git stash` -> not needed (use `jj new`). `jj describe` sets commit message.
- Revsets: `@` = working copy, `@-` = parent, `trunk()` = main. `A::B` inclusive, `A..B` excludes A. `x+` = children, `x-` = parents.
- Squash range: `jj squash --into <dest> --from '<dest>+::@'`. Always pass `-u` or `-m "msg"` to avoid editor hang.
- `gh` CLI: auto-detection fails in jj workspaces. Always pass `-R owner/repo`. Detect with: `jj git remote list | awk '/^origin/ {print $2}' | sed -E 's#.*[:/]([^/]+/[^/]+)\.git$#\1#'`
- `gh stack` (stacked PRs) hard-requires a local `.git` for repo detection - even its pure-API `link` path - so it dies with `fatal: not a git repository` in a non-colocated jj working copy (secondary `jj workspace add` workspaces have no `.git`). Workaround: push bookmarks with `jj git push` and open the PRs from anywhere with `gh pr create -R owner/repo --base <lower> --head <upper>` (base-chained), then run `gh stack link <PR1> <PR2> ...` (bottom-to-top, by PR number - pure GitHub API, no local state) from the **base/default** jj workspace, which is colocated and has the `.git` gh needs.
- Concurrent workspaces share ONE op log. Your edits sit un-snapshotted on disk until the next `jj` command; if another workspace advances the op log first, your next `jj` command hits `reconcile divergent operations` and resets your working copy to a fresh (empty) commit - the on-disk edits get checked out over. They are NOT lost: jj snapshots them into an orphan commit first.
- Because of this: run `jj st` (or `jj describe`) right after a batch of edits to anchor them in a commit, not just before pushing. Never go a long stretch of editing with no `jj` command run.
- Recover a reset working copy: `jj log -r 'mine() & ~empty()'` finds the orphan snapshot (your changed files, no description); verify with `jj diff -r <id> --stat`, then `jj describe`/`jj rebase -d main`/`jj bookmark create` on it as normal.

## Toolchain
- **mise** for runtime/tool version management. Use `mise run <task>` or `mise exec` when available.
- **JS/TS**: bun (not npm/yarn). `npm install` -> `bun install`, `npx` -> `bunx`.
- **Python**: uv (not pip/poetry). `pip install` -> `uv add`, `pip install -r` -> `uv sync`, `python -m` -> `uv run`.
- **JVM**: Kotlin (not Java), Gradle Kotlin DSL (.gradle.kts), JetBrains Exposed DSL (not JPA/Hibernate).
- **Database**: PostgreSQL + pgvector. Migrations: Flyway (Kotlin), Alembic (Python).
- **Linting**: ktlint (Kotlin), ruff (Python), ESLint + Prettier (TS), buf (Protobuf).
- **Testing**: JUnit 5 + MockK + TestContainers (Kotlin), pytest + pytest-asyncio (Python), Vitest + Playwright (TS).

## JVM Conventions
- Pragmatic DDD: value objects, aggregates, domain events where they add clarity. Ask when a pattern might benefit extensibility.
- Infra-domain decoupling: keep HTTP controllers, SQS listeners, remote clients strictly separated from domain logic. Never leak transport details into the domain layer.

## Code & Workflow
- Do NOT modify files unrelated to the current task. Never touch WIP files unless required for compilation.
- Follow user's design direction exactly. Do not substitute your own approach.
- Limit exploration to 2-3 minutes before proposing a plan or acting.
- For API/library questions, search online docs first rather than inspecting local JARs.
- Use **jq** via Bash for structured JSON access. Read tool is fine for viewing entire JSON files.

## Verification
- After multi-file refactors, run the project's compile/build step and tests before reporting completion.
- **NEVER** run `./gradlew :<module>:test` without `--tests "*.ClassName"` - TestContainers modules hang indefinitely.

## Task Agents
- The parent session is the only source-editing and implementation writer by default.
- NEVER delegate source editing or implementation to a subagent unless the user explicitly requests delegation.
- NEVER launch an async worker implicitly. A write-capable worker requires an explicit user request.
- Proactive subagents are limited to read-only exploration, planning, research, review, and validation.
- For cross-cutting changes, use read-only subagents to map dependencies or review work; the parent session performs the implementation.
- Do not create or use additional worktrees or workspaces unless the user explicitly asks.
- Use foreground agents when results are needed to proceed. Background agents are allowed only for independent read-only work unless the user explicitly requests otherwise.

## Dangerous Commands
- **NEVER** run `terraform plan/apply`, destructive Docker commands, destructive SQL, or dependency installs (`bun install`, `uv sync`, `uv add`) unless explicitly asked.

## Optional AWS Agent Skills
- Do not install AWS Agent Toolkit skills by default. If a task would benefit from a specific skill, review the official catalog at https://github.com/aws/agent-toolkit-for-aws/tree/main/skills and propose adding only that skill.
