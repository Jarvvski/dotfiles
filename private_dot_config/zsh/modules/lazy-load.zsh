# Lazy load heavy tools to improve startup time (run when the shell is idle).
#
# IMPORTANT: wrap the inits in a function and defer the FUNCTION call. If you
# write `zsh-defer eval "$(direnv hook zsh)"` the $(...) is expanded at source
# time, so the subprocess still spawns during startup - defeating the defer.
# Running them inside a deferred function delays the command substitution too.
_lazy_init() {
  # mise first: it puts managed shims (node, java, pay-respects, ...) on PATH
  eval "$(mise activate zsh)"
  eval "$(direnv hook zsh)"          # direnv can be slow on large projects
  eval "$(zoxide init zsh)"
  eval "$(ldcli completion zsh)"     # LaunchDarkly CLI completion
  eval "$(pay-respects zsh --alias f)"  # `f` corrects the previous command
  # carapace: multi-shell completions for 500+ commands, bridged from other
  # engines. Sourced after compinit; integrates with fzf-tab. No-op if absent.
  if (( $+commands[carapace] )); then
    export CARAPACE_BRIDGES='zsh,fish,bash,inshellcomp'
    source <(carapace _carapace)
  fi
}

if (( $+functions[zsh-defer] )); then
  zsh-defer _lazy_init
else
  _lazy_init
fi
