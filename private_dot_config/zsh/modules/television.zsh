# television (tv) - a file picker on Ctrl-G that inserts the selection(s) at the
# cursor. Deliberately NOT bound to Ctrl-T (fzf) or Ctrl-R (atuin), which stay as
# they are. In a jj/git repo, prefer the dedicated channels: `tv jj-log`,
# `tv jj-diff`, `tv git-log`, etc.
_tv_file_widget() {
  emulate -L zsh
  local -a picks
  picks=("${(@f)$(tv files 2>/dev/null)}")
  if (( ${#picks} == 0 )) || [[ -z "$picks[1]" ]]; then
    zle redisplay
    return
  fi
  LBUFFER+="${(j: :)${(q)picks[@]}} "
  zle reset-prompt
}
zle -N _tv_file_widget
bindkey '^G' _tv_file_widget
