#!/usr/bin/env bash
set -euo pipefail
chezmoi add ~/.config/zsh/
chezmoi add ~/.config/git/
chezmoi add ~/.config/bat/
chezmoi add ~/.config/colima/
chezmoi add ~/.config/fd/
chezmoi add ~/.config/hammerspoon/
chezmoi add ~/.config/jj/
chezmoi add ~/.config/karabiner/
chezmoi add ~/.config/kitty/
chezmoi add ~/.config/linearmouse/
chezmoi add ~/.config/mise/
chezmoi add ~/.config/nvim/
chezmoi add ~/.config/ohmyposh/
chezmoi add ~/.config/wezterm/
chezmoi add ~/.config/cron/

# Pi portable configuration only. Credentials and machine-local state are excluded.
chezmoi add ~/.config/pi/AGENTS.md
chezmoi add ~/.config/pi/bin/
chezmoi add ~/.config/pi/extensions/
chezmoi add ~/.config/pi/keybindings.json
chezmoi add ~/.config/pi/mcp.json
chezmoi add ~/.config/pi/patches/
chezmoi add ~/.config/pi/plan-mode.json
chezmoi add ~/.config/pi/prompts/
chezmoi add ~/.config/pi/safety-guard.json
chezmoi add ~/.config/pi/settings.json
chezmoi add ~/.config/pi/themes/
chezmoi add ~/.config/pi/web-search.json

chezmoi add ~/.claude/settings.json

chezmoi add ~/.gnupg/
chezmoi add ~/.zshenv
chezmoi add ~/.local/bin/jj-spr
chezmoi add ~/.local/bin/jj-bcn
chezmoi add ~/.local/bin/package.json

# Update brew file
brew bundle dump --file ~/.Brewfile --force
chezmoi add ~/.Brewfile

chezmoi add ~/.install.sh
chezmoi add ~/.cron.sh
