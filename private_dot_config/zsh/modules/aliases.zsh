# General Aliases
alias zshrc="$EDITOR $ZDOTDIR/.zshrc"
alias czshrc="code $ZDOTDIR/.zshrc"
alias cpwd="pwd | xclip -selection clipboard"
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
    jj -R ~/.local/share/chezmoi b set main -r 'git_head()'
    jj -R ~/.local/share/chezmoi git push
}
alias dotu='~/.cron.sh'
alias dotst='jj -R ~/.local/share/chezmoi ls'
