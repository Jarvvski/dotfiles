#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Installing Homebrew if not present..."
if ! command -v brew >/dev/null 2>&1; then
  NONINTERACTIVE=1 \
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo "🍺 Installing packages from Brewfile..."
brew bundle --file="$HOME/.Brewfile"
