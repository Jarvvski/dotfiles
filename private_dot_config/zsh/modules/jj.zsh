JJ_CONFIG_HOME="$XDG_CONFIG_HOME/jj"

alias jst="jj status --color always"
alias jls="jj ls"
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
alias jt="jj tree"
alias jsm="jj new main"
alias jin="jj insert"
alias jqj="jj wsx"
alias jop="jj-op"
alias jdc="jj describe"
alias jde="jj describe"
alias jbc="jj bcn"
alias jpr="jj spr"
alias jfe="jj fetch"

# Wrap jj so "jj ws" can cd
function jj() {
  if [[ "$1" == "ws" || "$1" == "w" ]]; then
    shift
    ws "$@"
  else
    command jj "$@"
  fi
}
alias j="jj"

# ============================================
# Workspace manager (cd wrapper for jj-ws)
# ============================================

ws() {
  case "${1:-}" in
    home|h|--home|-H)
      local root
      root=$(jj-ws root) || return 1
      cd "$root" ;;
    rm|remove)
      if [[ $# -le 1 ]]; then
        # No workspace name given - remove current workspace and close tab
        local _ws_d="$PWD" _ws_name="" _ws_root
        while [[ "$_ws_d" != "/" ]]; do
          [[ -d "$_ws_d/.jj" ]] && break
          _ws_d="${_ws_d:h}"
        done
        # Resolve main repo root (workspaces have .jj/repo pointing back)
        _ws_root="$_ws_d"
        if [[ -f "$_ws_d/.jj/repo" ]]; then
          local _repo_target
          _repo_target=$(<"$_ws_d/.jj/repo")
          [[ "$_repo_target" != /* ]] && _repo_target="$_ws_d/.jj/$_repo_target"
          _ws_root="${_repo_target:h:h}"
        fi
        if [[ "$_ws_root" != "/" && -f "$_ws_root/.jj/ws-cache" ]]; then
          _ws_name=$(command grep "	${_ws_d}$" "$_ws_root/.jj/ws-cache" | cut -f1)
        fi
        if [[ -z "$_ws_name" || "$_ws_name" == "default" ]]; then
          echo "Not in a removable workspace" >&2; return 1
        fi
        jj-ws rm "$_ws_name" || return 1
        if [[ -n "${KITTY_PID:-}" ]]; then
          kitten @ close-tab
        fi
      else
        jj-ws "$@"
      fi ;;
    list|ls|clean|where|info|root|path|refresh|sync|pool|dispatch|d|status|logs|log|help|-h|--help)
      jj-ws "$@" ;;
    "")
      jj-ws list ;;
    -*)
      echo "Unknown option: $1" >&2; return 1 ;;
    *)
      local name="$1"; shift
      local _ws_is_new=0 _ws_d="$PWD"
      while [[ "$_ws_d" != "/" ]]; do
        [[ -d "$_ws_d/.jj" ]] && break
        _ws_d="${_ws_d:h}"
      done
      if [[ "$_ws_d" != "/" ]]; then
        if [[ ! -f "$_ws_d/.jj/ws-cache" ]] || ! command grep -q "^${name}	" "$_ws_d/.jj/ws-cache"; then
          _ws_is_new=1
        fi
      fi

      local p
      p=$(jj-ws add "$name") || return 1

      if (( _ws_is_new )) && [[ -n "${KITTY_PID:-}" ]]; then
        local _win_id
        _win_id=$(kitten @ launch --type=tab --tab-title "$name" --cwd="$p" -- zsh -ic "claude; exec zsh")
        kitten @ launch --match "id:$_win_id" --location=vsplit --cwd="$p" -- zsh -ic "mise prep; clear; exec zsh"
        kitten @ focus-window --match "id:$_win_id"
      elif (( $# == 0 )); then
        cd "$p"
      else
        (cd "$p" && "$@")
      fi ;;
  esac
}

_ws_workspace_names() {
  local root cf
  root=$(jj-ws root 2>/dev/null) || return
  cf="$root/.jj/ws-cache"
  [[ -f "$cf" ]] && cut -f1 "$cf" 2>/dev/null
}

_ws_complete() {
  local -a ws_names
  ws_names=("${(@f)$(_ws_workspace_names)}")

  _arguments -C \
    '1:command:->cmd' \
    '*:workspace:->args' \
    && return

  case "$state" in
    cmd)
      local -a subcmds=(
        'home:cd to main repo'
        'h:cd to main repo'
        'list:list workspaces'
        'ls:list workspaces'
        'rm:remove workspaces'
        'clean:remove all non-default workspaces'
        'where:show repo and workspace paths'
        'root:print repo root'
        'path:print workspace path'
        'refresh:rebuild workspace cache'
        'pool:manage worker pool'
        'dispatch:dispatch ticket to worker'
        'status:show pool status'
        'logs:tail worker log'
        'help:show help'
      )
      _describe 'command' subcmds -- ws_names
      ;;
    args)
      case "${words[2]}" in
        rm|remove)
          # Exclude default and already-listed names
          local -a avail
          avail=("${(@)ws_names:#default}")
          local w
          for w in "${words[@]:2}"; do
            avail=("${(@)avail:#$w}")
          done
          _describe 'workspace' avail ;;
        path)
          _describe 'workspace' ws_names ;;
      esac
      ;;
  esac
}
compdef _ws_complete ws
