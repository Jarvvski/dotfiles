# Lazy load heavy tools to improve startup time
# These will load when shell is idle

# Check if zsh-defer is available, otherwise load immediately
if (( $+functions[zsh-defer] )); then
  # Defer direnv (can be slow on large projects)
  zsh-defer eval "$(direnv hook zsh)"

  # Defer zoxide init
  zsh-defer eval "$(zoxide init zsh)"

  # Defer LaunchDarkly CLI completion
  zsh-defer eval "ldcli completion zsh"

  zsh-defer eval "$(mise activate zsh)"
else
  # Fallback: load immediately if zsh-defer not available
  eval "$(direnv hook zsh)"
  eval "$(zoxide init zsh)"
  eval "$(ldcli completion zsh)"
  eval "$(mise activate zsh)"
fi

# Defer asdf shims (can be slow)
# Note: Keep ASDF_DATA_DIR exports in asdf.zsh, only defer the shim loading
