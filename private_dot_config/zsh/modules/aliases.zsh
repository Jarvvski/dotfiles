# General Aliases
alias zshrc="$EDITOR $ZDOTDIR/.zshrc"
alias czshrc="code $ZDOTDIR/.zshrc"
alias cpwd="pwd | pbcopy"
alias randomPass="echo $RANDOM | md5sum | head -c 20; echo;"

alias gnetstat='lsof -Pi | grep -i listen'
alias gwo='gw openidea'

alias omp="oh-my-posh"
alias c="clear"

alias ll="ls -l"
alias lla="ls -la"

# Push dotfile changes up.
# CRITICAL: `chezmoi re-add` first - this pulls your live config edits into the
# chezmoi source. Without it the source silently drifts from reality (the old
# dotp just committed whatever was already in source). Pass a message: dotp "fix nvim lsp"
function dotp() {
    local repo=~/.local/share/chezmoi
    chezmoi re-add || return 1
    # Nothing drifted? Skip - avoids pushing empty "chezmoi sync" commits.
    if [[ "$(jj -R "$repo" log -r @ --no-graph -T empty 2>/dev/null)" == "true" ]]; then
        echo "dotp: no dotfile changes to sync"
        return 0
    fi
    local msg="${*:-chezmoi sync}"
    jj -R "$repo" describe -m "$msg"
    jj -R "$repo" bookmark set main -r @
    # main is remote-tracked (+ auto-track-bookmarks in jj config), so no
    # --allow-new is needed; and jj auto-creates a fresh empty @ once the
    # pushed commit becomes immutable, so no trailing `jj new` is needed.
    jj -R "$repo" git push --bookmark main
}
# Pull dotfile changes from the remote and apply them to the live filesystem.
function dotf() {
    local repo=~/.local/share/chezmoi
    jj -R "$repo" git fetch
    jj -R "$repo" new main
    chezmoi apply
}
# Show what has drifted between live config and the chezmoi source (run before dotp).
alias dotd='chezmoi status'
alias dotu='~/.cron.sh'
alias dotst='jj -R ~/.local/share/chezmoi ls'

# for localstack
#alias awslocal="AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=${DEFAULT_REGION:-$AWS_DEFAULT_REGION} aws --endpoint-url=http://${LOCALSTACK_HOST:-localhost}:4566"

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
alias mono="cd ~/code/ameba/mono" # jump to ameba monorepo
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
