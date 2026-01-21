JJ_CONFIG_HOME="$XDG_CONFIG_HOME/jj"

alias jst="jj status --color always"
alias jlg="jj log"
alias jl="jj pull"
alias jp="jj push"
alias jf="jj forge"
alias jy="jj yank"

export JJ_CONFIG="$JJ_CONFIG_HOME/config.toml"

# completions for jj cli (dynamic completions provide revset suggestions)
source <(COMPLETE=zsh jj)

# Override jj completion to show only change IDs in list
# while fzf-tab preview shows full details
_jj_short_revisions() {
  # Set a simpler template for completion context only
  JJ_OP_LOG_TEMPLATE='change_id.short()' jj log --no-graph -T 'change_id.short()' 2>/dev/null
}

# Customize the completion function to use short format
compdef _clap_dynamic_completer_jj_custom jj
function _clap_dynamic_completer_jj_custom() {
    # Temporarily set environment to use short format for completions
    local _CLAP_COMPLETE_INDEX=$(expr $CURRENT - 1)
    local _CLAP_IFS=$'\n'

    local completions=("${(@f)$( \
        _CLAP_IFS="$_CLAP_IFS" \
        _CLAP_COMPLETE_INDEX="$_CLAP_COMPLETE_INDEX" \
        COMPLETE="zsh" \
        JJ_LOG_TEMPLATE='change_id.short()' \
        jj -- "${words[@]}" 2>/dev/null \
    )}")

    if [[ -n $completions ]]; then
        _describe 'values' completions
    fi
}

# ============================================
# FZF Integration for Jujutsu
# ============================================

# Default revset for fzf commands - shows more than your working set
# Your regular 'jj log' stays short for active work, but these show extended history
JJ_FZF_REVSET='trunk().. | ::trunk() | bookmarks()'

# Fuzzy select a revision and show its diff
jj-diff() {
  local rev
  rev=$(jj log --no-graph --color=always -r "$JJ_FZF_REVSET" -T 'change_id.short() ++ " " ++ description.first_line()' | \
    fzf --ansi --preview 'jj diff -r {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$rev" ] && jj diff -r "$(echo $rev | awk '{print $1}')"
}

# Fuzzy select a revision and edit it
jj-edit() {
  local rev
  rev=$(jj log --no-graph --color=always -r "$JJ_FZF_REVSET" -T 'change_id.short() ++ " " ++ description.first_line()' | \
    fzf --ansi --preview 'jj show {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$rev" ] && jj edit "$(echo $rev | awk '{print $1}')"
}

# Fuzzy select a revision and show it
jj-show() {
  local rev
  rev=$(jj log --no-graph --color=always -r "$JJ_FZF_REVSET" -T 'change_id.short() ++ " " ++ description.first_line()' | \
    fzf --ansi --preview 'jj show {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$rev" ] && jj show "$(echo $rev | awk '{print $1}')"
}

# Fuzzy select a revision and abandon it
jj-abandon() {
  local rev
  rev=$(jj log --no-graph --color=always -r 'mutable() & mine()' -T 'change_id.short() ++ " " ++ description.first_line()' | \
    fzf --ansi --preview 'jj show {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$rev" ] && echo "Abandon $(echo $rev | awk '{print $1}')? (y/n)" && \
  read -q && jj abandon "$(echo $rev | awk '{print $1}')"
}

# Fuzzy select a revision and squash it
jj-squash() {
  local rev
  rev=$(jj log --no-graph --color=always -r 'mutable() & mine()' -T 'change_id.short() ++ " " ++ description.first_line()' | \
    fzf --ansi --preview 'jj show {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$rev" ] && jj squash -r "$(echo $rev | awk '{print $1}')"
}

# Interactive log viewer with fzf - uses extended revset
jj-log() {
  local revset="${1:-$JJ_FZF_REVSET}"
  jj log --color=always -r "$revset" | \
    fzf --ansi --no-sort --preview 'echo {}' --preview-window=down:3:wrap --bind 'enter:execute(echo {})' --border=rounded --height=80%
}

# Fuzzy select from operation log
jj-op() {
  local op
  op=$(jj op log --color=always | \
    fzf --ansi --preview 'jj op show {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$op" ] && jj op show "$(echo $op | awk '{print $1}')"
}

# Fuzzy undo operation
jj-undo() {
  local op
  op=$(jj op log --color=always | \
    fzf --ansi --preview 'jj op show {1}' --preview-window=right:60% --border=rounded --height=80%) && \
  [ -n "$op" ] && echo "Undo to operation $(echo $op | awk '{print $1}')? (y/n)" && \
  read -q && jj op undo "$(echo $op | awk '{print $1}')"
}

# Aliases for convenience
alias jd="jj-diff"
alias je="jj-edit"
alias js="jj-show"
alias jlog="jj-log"
alias jop="jj-op"
