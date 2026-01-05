# PATH Management - Single source of truth
# Order matters: earlier entries take precedence

# User local binaries (highest priority)
export PATH="$HOME/.local/bin:$PATH"

# Homebrew (must be early to override system tools)
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/opt/homebrew/sbin:$PATH"

# JetBrains Toolbox
export PATH="$PATH:$HOME/Library/Application Support/JetBrains/Toolbox/scripts"

# Rust (via asdf, but good to be explicit)
export PATH="$HOME/.local/share/asdf/installs/rust/1.83.0/bin:$PATH"

# ASDF shims (loaded in asdf.zsh module, mentioned here for reference)
# export PATH="$ASDF_DATA_DIR/shims:$PATH"