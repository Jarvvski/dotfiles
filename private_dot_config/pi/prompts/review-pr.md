---
description: Interactively address unresolved GitHub PR review comments
argument-hint: "<PR URL or number>"
---
Invoke the loaded `review-pr` skill for: $ARGUMENTS

Adapt any Claude-specific tool names and plan-file instructions in the skill to Pi's available tools and active in-session plan mode. Use the questionnaire tool for its interactive choices. Respect the user's Jujutsu-only workflow: never use Git commands, create worktrees, create additional workspaces, commit, or push. Ask before resolving remote review threads or making an ambiguous fix.
