JJ_CONFIG_HOME="$XDG_CONFIG_HOME/jj"

alias jst="jj status --color always"
alias jlg="jj log"
alias jl="jj pull"
alias jp="jj push"
alias jf="jj forge"
alias jy="jj yank"

export JJ_CONFIG="$JJ_CONFIG_HOME/config.toml"

# completetions for jj cli
source <(jj util completion zsh)
