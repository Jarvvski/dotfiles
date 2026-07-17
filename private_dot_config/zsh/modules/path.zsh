# PATH Management - Single source of truth
# Order matters: earlier entries take precedence

# User local binaries (highest priority)
export PATH="$HOME/.local/bin:$PATH"

# Cargo
export PATH="$HOME/.cargo/bin:$PATH"

# Bun
export PATH="$HOME/.cache/.bun/bin:$PATH"

# Homebrew (must be early to override system tools)
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/opt/homebrew/sbin:$PATH"

# mise shims: resolve tool versions on invocation with no `mise activate`, so
# non-interactive shells (zsh -c, editors, jjfx's claude pane, cron) get the
# managed tools too - the deferred `mise activate` in lazy-load.zsh never fires
# without a prompt. Placed last so it takes precedence over Homebrew.
export PATH="${XDG_DATA_HOME:-$HOME/.local/share}/mise/shims:$PATH"

# JetBrains Toolbox
export PATH="$PATH:$HOME/Library/Application Support/JetBrains/Toolbox/scripts"
