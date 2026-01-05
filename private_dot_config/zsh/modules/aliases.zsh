# General Aliases
alias zshrc="$EDITOR $ZDOTDIR/.zshrc"
alias czshrc="code $ZDOTDIR/.zshrc"
alias cpwd="pwd | pbcopy"
alias randomPass="echo $RANDOM | md5sum | head -c 20; echo;"
alias cat="bat"

alias gnetstat='lsof -Pi | grep -i listen'
alias gwo='gw openidea'

alias omp="oh-my-posh"
alias c="clear"

alias ll="ls -l"
alias lla="ls -la"

# push any dotfiles changes up
function dotp() {
    jj -R ~/.local/share/chezmoi describe -m "Sync"
    jj -R ~/.local/share/chezmoi b set main -r @
    jj -R ~/.local/share/chezmoi git push --branch main
}
alias dotu='~/.cron.sh'
alias dotst='jj -R ~/.local/share/chezmoi ls'

# for localstack
alias awslocal="AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=${DEFAULT_REGION:-$AWS_DEFAULT_REGION} aws --endpoint-url=http://${LOCALSTACK_HOST:-localhost}:4566"

# terraform
alias tf="terraform"
alias tfwrap="find . -name \"*.tf\" -not -path \"*/.terraform/*\" -exec echo \"=== {} ===\" \; -exec cat {} \; -exec echo \"\" \;"

# Modern CLI tools (replacements for standard tools)
alias top="btm"           # bottom - better top/htop
alias ps="procs"          # procs - better ps
alias du="dust"           # dust - better du
alias dig="doggo"         # doggo - better dig
alias y="yazi"            # yazi - terminal file manager
alias yy="yazi"           # double tap for yazi

# Enhanced tools
alias less="bat"          # bat with paging
alias cat="bat --paging=never"  # bat without paging (override existing)

# Quality of Life
alias reload="exec zsh"   # reload shell
alias dots="cd ~/.config" # jump to dotfiles
alias chezmoi-edit="cd ~/.local/share/chezmoi" # jump to chezmoi source

# System info
alias myip="curl -s https://api.ipify.org && echo"
alias localip="ipconfig getifaddr en0"

# Cleanup
alias cleanup-ds="find . -type f -name '*.DS_Store' -ls -delete"
alias cleanup-brew="brew update && brew upgrade && brew cleanup"

# Docker shortcuts (using Colima)
alias dps="docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
alias dimg="docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'"

# Quick HTTP server
alias serve="python3 -m http.server"
