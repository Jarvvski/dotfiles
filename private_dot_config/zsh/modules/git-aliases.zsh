# aliases
alias gcl="git clone"
alias gd="git diff"
alias ga="git add"
alias gp="git push"
alias gm="git merge"
alias gr="git rebase"
alias gco="git checkout"
alias gaa="git add --all"
alias gfa="git fetch --all"
alias gst="git status -s"
alias gsl="git sl"
alias gcod="git checkout --detach"
alias ggn="git next"
alias ggp="git prev"
alias gpf="git push --force-with-lease --force-if-includes"
alias gc="git commit -S --no-verify"
alias gl="git pull --rebase --gpg-sign=ajarvis@ameba.ai"
alias gca="git add -A && git commit -S --no-verify"
alias gcaa="git commit -S --no-verify --amend"
alias gstap="git stash pop"
alias glg="git log --graph --abbrev-commit --decorate --format=format:'%C(bold blue)%h%C(reset) - %C(bold green)(%ar)%C(reset) %C(white)%s%C(reset) %C(dim white)- %an%C(reset)%C(bold yellow)%d%C(reset)' --all"
alias glg1="git log --graph --abbrev-commit --decorate --format=format:'%C(bold blue)%h%C(reset) - %C(bold cyan)%aD%C(reset) %C(bold green)(%ar)%C(reset)%C(bold yellow)%d%C(reset)%n''          %C(white)%s%C(reset) %C(d    im white)- %an%C(reset)' --all"
alias glg="git log --graph --abbrev-commit --decorate --format=format:'%C(bold blue)%h%C(reset) - %C(bold green)(%ar)%C(reset) %C(white)%s%C(reset) %C(dim white)- %an%C(reset)%C(bold yellow)%d%C(reset)' --all"

function git_current_branch() {
    local ref
    ref=$(__git_prompt_git symbolic-ref --quiet HEAD 2> /dev/null)
    local ret=$?
    if [[ $ret != 0 ]]; then
        [[ $ret == 128 ]] && return  # no git repo.
        ref=$(__git_prompt_git rev-parse --short HEAD 2> /dev/null) || return
    fi
    echo ${ref#refs/heads/}
}

alias gpsup="git push --set-upstream origin $(git_current_branch)"
