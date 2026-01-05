eval "$(oh-my-posh init zsh --config $XDG_CONFIG_HOME/ohmyposh/tokyonight_storm.toml)"

# Set continuation prompt (PS2) - remove any leading space
# The %_ shows what construct is being continued (optional)
setopt PROMPT_SUBST
export PS2='%F{cyan}➜%f '
