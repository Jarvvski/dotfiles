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
export FZF_ALT_C_OPTS="--preview 'eza --tree --color=always {} | head -200'"

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
alias ls="eza --color=always --git --no-filesize --icons=always --no-time --no-user --no-permissions"

export FZF_DEFAULT_OPTS="$FZF_DEFAULT_OPTS \
  --highlight-line \
  --info=inline-right \
  --ansi \
  --layout=reverse \
  --border=none
  --color=bg+:#1A1B27 \
  --color=bg:#1A1B27 \
  --color=border:#27a1b9 \
  --color=fg:#c0caf5 \
  --color=gutter:#1A1B27 \
  --color=header:#ff9e64 \
  --color=hl+:#2ac3de \
  --color=hl:#2ac3de \
  --color=info:#545c7e \
  --color=marker:#ff007c \
  --color=pointer:#ff007c \
  --color=prompt:#2ac3de \
  --color=query:#c0caf5:regular \
  --color=scrollbar:#27a1b9 \
  --color=separator:#ff9e64 \
  --color=spinner:#ff007c \
"

cd_to_dir() {
    local selected_dir
    selected_dir=$(fd -t d . "$HOME" | fzf +m --height 50% --preview 'tree -C {}')
    if [[ -n "$selected_dir" ]]; then
        # Change to the selected directory
        cd "$selected_dir" || return 1
    fi
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
