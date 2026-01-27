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

# JetBrains Toolbox
export PATH="$PATH:$HOME/Library/Application Support/JetBrains/Toolbox/scripts"
