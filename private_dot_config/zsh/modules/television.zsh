# television (tv) - a file picker on Ctrl-G that inserts the selection(s) at the
# cursor. Deliberately NOT bound to Ctrl-T (fzf) or Ctrl-R (atuin), which stay as
# they are. In a jj/git repo, prefer the dedicated channels: `tv jj-log`,
# `tv jj-diff`, `tv git-log`, etc.
#
# NOTE: tv renders its TUI on stderr - never redirect its stderr (no 2>/dev/null)
# or you suppress the entire interface.
_tv_file_widget() {
  emulate -L zsh
  local -a picks
  picks=("${(@f)$(tv files)}")
  if (( ${#picks} == 0 )) || [[ -z "$picks[1]" ]]; then
    zle redisplay
    return
  fi
  LBUFFER+="${(j: :)${(q)picks[@]}} "
  zle reset-prompt
}
zle -N _tv_file_widget
bindkey '^G' _tv_file_widget

# Pick file(s) with television and open them in nvim.
# Tab multi-selects; Enter opens all selected as buffers.
tvf() {
  emulate -L zsh
  local -a picks
  picks=("${(@f)$(tv files --input "$*")}")
  (( ${#picks[@]} )) && [[ -n "$picks[1]" ]] && nvim -- "${picks[@]}"
}
alias fn="tvf"

# ZLE widget: launch the picker, then run nvim on the selection(s).
_tv_nvim_widget() {
  emulate -L zsh
  local -a picks
  picks=("${(@f)$(tv files)}")
  if (( ${#picks[@]} )) && [[ -n "$picks[1]" ]]; then
    BUFFER="nvim -- ${(j: :)${(q)picks[@]}}"
    CURSOR=${#BUFFER}
    zle accept-line
  else
    zle redisplay
  fi
}
zle -N _tv_nvim_widget
bindkey '^X^F' _tv_nvim_widget
