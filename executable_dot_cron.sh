#!/usr/bin/env bash
set -euo pipefail
chezmoi add ~/.config/zsh/
chezmoi add ~/.config/git/
chezmoi add ~/.config/bat/
chezmoi add ~/.config/colima/
chezmoi add ~/.config/fd/
chezmoi add ~/.config/hammerspoon/
chezmoi add ~/.config/jj/config.toml
chezmoi add ~/.config/karabiner/
chezmoi add ~/.config/kitty/
chezmoi add ~/.config/linearmouse/
chezmoi add ~/.config/mise/
chezmoi add ~/.config/nvim/
chezmoi add ~/.config/ohmyposh/
chezmoi add ~/.config/wezterm/
chezmoi add ~/.config/ghostty/
chezmoi re-add ~/.config/jjfx/config.toml
chezmoi add ~/.config/zed/settings.json
chezmoi add ~/.config/cron/

# Pi portable configuration only. Credentials and machine-local state are excluded.
chezmoi add ~/.config/pi/AGENTS.md
chezmoi add ~/.config/pi/bin/
chezmoi add ~/.config/pi/extensions/00-workflow-policy.ts
chezmoi add ~/.config/pi/extensions/auto-continue-compaction.ts
chezmoi add ~/.config/pi/extensions/color-footer.ts
chezmoi add ~/.config/pi/extensions/context-command.ts
chezmoi add ~/.config/pi/extensions/council/*.ts ~/.config/pi/extensions/council/config.json
chezmoi add ~/.config/pi/extensions/memory/
chezmoi add ~/.config/pi/extensions/plan-mode/
chezmoi add ~/.config/pi/extensions/prompt-history-and-skills.ts
chezmoi add ~/.config/pi/extensions/safety-guard.ts
chezmoi add ~/.config/pi/extensions/subagent/
chezmoi add ~/.config/pi/keybindings.json
chezmoi add ~/.config/pi/mcp.json
chezmoi add ~/.config/pi/patches/
chezmoi add ~/.config/pi/plan-mode.json
chezmoi add ~/.config/pi/prompts/
chezmoi add ~/.config/pi/safety-guard.json
chezmoi add ~/.config/pi/settings.json
chezmoi add ~/.config/pi/themes/
chezmoi add ~/.config/pi/skills/
chezmoi add ~/.config/pi/web-search.json

chezmoi add ~/.agent-shared/skills/
chezmoi add ~/.agents/skills/

chezmoi add ~/.claude/settings.json
chezmoi add ~/.claude/CLAUDE.md
chezmoi add ~/.claude/statusline-command.sh

chezmoi add ~/.gnupg/
chezmoi add ~/.cargo/binstall.toml
chezmoi add ~/.hushlogin
chezmoi add ~/.zshenv
chezmoi add ~/.local/bin/jj-spr
chezmoi add ~/.local/bin/jj-bcn
chezmoi add ~/.local/bin/jj-forge
chezmoi add ~/.local/bin/jj-nav
chezmoi add ~/.local/bin/jj-tree
chezmoi add ~/.local/bin/jj-ws
chezmoi add ~/.local/bin/jj-wsx
chezmoi add ~/.local/bin/bun.lock
chezmoi add ~/.local/bin/package.json

# Update brew file
brew bundle dump --file ~/.Brewfile --force
chezmoi add ~/.Brewfile

chezmoi add ~/.install.sh
chezmoi add ~/.cron.sh
