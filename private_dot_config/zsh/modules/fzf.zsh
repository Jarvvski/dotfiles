smartcache eval fzf --zsh

# -- Use fd instead of fzf --
export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"

# Use fd (https://github.com/sharkdp/fd) for listing path candidates.
# - The first argument to the function ($1) is the base path to start traversal
# - See the source code (completion.{bash,zsh}) for the details.
_fzf_compgen_path() {
  fd --hidden --exclude .git . "$1"
}

# Use fd to generate the list for directory completion
_fzf_compgen_dir() {
  fd --type=d --hidden --exclude .git . "$1"
}

zcomet snippet https://raw.githubusercontent.com/junegunn/fzf-git.sh/refs/heads/main/fzf-git.sh

show_file_or_dir_preview="if [ -d {} ]; then eza --tree --color=always {} | head -200; else bat -n --color=always --line-range :500 {}; fi"

export FZF_CTRL_T_OPTS="--preview '$show_file_or_dir_preview'"
export FZF_ALT_C_OPTS="--preview 'eza --tree --color=always {} | head -200' --preview-window 'right,50%,border-left'"

# Advanced customization of fzf options via _fzf_comprun function
# - The first argument to the function is the name of the command.
# - You should make sure to pass the rest of the arguments to fzf.
_fzf_comprun() {
  local command=$1
  shift

  case "$command" in
    cd)           fzf -i --preview 'eza --tree --color=always {} | head -200' "$@" ;;
    export|unset) fzf -i --preview "eval 'echo ${}'"         "$@" ;;
    ssh)          fzf -i --preview 'dig {}'                   "$@" ;;
    *)            fzf -i --preview "$show_file_or_dir_preview" "$@" ;;
  esac
}

# ---- Eza (better ls) -----
alias ls="eza --color=always --git --icons=always"

export FZF_DEFAULT_OPTS="$FZF_DEFAULT_OPTS \
  --highlight-line \
  --info=inline-right \
  --ansi \
  --layout=reverse \
  --border=rounded \
  --color=bg:-1 \
  --color=bg+:#303030 \
  --color=gutter:-1 \
  --color=fg:-1 \
  --color=hl:6 \
  --color=hl+:14 \
  --color=info:8 \
  --color=border:#00c2ff \
  --color=header:3 \
  --color=marker:2 \
  --color=pointer:5 \
  --color=prompt:#00c2ff \
  --color=query:-1 \
  --color=scrollbar:0 \
  --color=separator:8 \
  --color=spinner:13 \
"

cd_to_dir() {
    local root="${1:-$HOME}" dir
    dir=$(fd --type d --hidden --exclude .git . "$root" |
        fzf --height=60% --layout=reverse --preview 'eza --tree --color=always --level=2 {} | head -200' --bind 'right:reload(fd --type d --hidden --exclude .git . {})' --header 'Enter=cd   Right=descend') &&
        cd -- "$dir"
}

nvim_to_file() {
    local selected_file
    selected_file=$(fd -t f . "$HOME" | fzf +m --height 50% --preview 'tree -C {}')
    if [[ -n "$selected_file" ]]; then
        nvim "$selected_file" || return 1
    fi
}

alias cdd="cd_to_dir"
alias ffz="nvim_to_file"
