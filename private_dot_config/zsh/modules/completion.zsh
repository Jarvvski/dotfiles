# ZSH Completion Configuration

# Enable caching for faster completions
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path "$XDG_CACHE_HOME/zsh/zcompcache"

# Case-insensitive completion (already in .zshrc but documented here)
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'

# Colorful completion listings
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"

# Group completions by type
zstyle ':completion:*' group-name ''
zstyle ':completion:*:descriptions' format '%F{cyan}-- %d --%f'
zstyle ':completion:*:corrections' format '%F{yellow}-- %d (errors: %e) --%f'
zstyle ':completion:*:messages' format '%F{purple}-- %d --%f'
zstyle ':completion:*:warnings' format '%F{red}-- no matches found --%f'

# Better completion menu behavior
zstyle ':completion:*' menu select
zstyle ':completion:*' complete-options true
zstyle ':completion:*' file-sort modification

# Better kill completion
zstyle ':completion:*:*:kill:*' menu yes select
zstyle ':completion:*:kill:*' force-list always
zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#)*=0=01;31'

# SSH/SCP host completion from known_hosts
zstyle ':completion:*:(ssh|scp|rsync):*' hosts off

# ── wsg completion ──────────────────────────────────────────────

__wsg_workers() {
  local -a workers
  workers=("${(@f)$(wsg __complete workers 2>/dev/null)}")
  _describe 'worker' workers
}

__wsg_non_busy_workers() {
  local -a workers
  workers=("${(@f)$(wsg __complete non-busy-workers 2>/dev/null)}")
  _describe 'worker' workers
}

__wsg_workspaces() {
  local -a workspaces
  workspaces=("${(@f)$(wsg __complete workspaces 2>/dev/null)}")
  _describe 'workspace' workspaces
}

_wsg() {
  local -a commands
  commands=(
    'add:Create workspace'
    'rm:Remove workspace'
    'list:List workspaces'
    'clean:Remove all non-default workspaces'
    'root:Print repo root'
    'where:Show repo and workspace paths'
    'path:Print workspace path'
    'refresh:Rebuild workspace cache'
    'pool:Manage worker pool'
    'dispatch:Dispatch ticket(s) to workers'
    'send:Resume worker with a follow-up prompt'
    'review:Address PR review comments'
    'mount:Open worker in kitty'
    'reset:Reset a worker to idle'
    'status:Show pool status'
    'logs:Tail worker log'
    'help:Show help'
  )

  local -a pool_commands
  pool_commands=(
    'list:Show pool status'
    'create:Create or resize pool'
    'resize:Resize pool'
    'destroy:Tear down pool'
    'reset:Reset a worker to idle'
  )

  _arguments -C \
    '1:command:->command' \
    '*::arg:->args'

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        add|a)
          _arguments \
            '-r[revision]:revision:' \
            '--revision[revision]:revision:'
          ;;
        rm|remove)
          _arguments \
            '--force[force removal]' \
            '1:workspace:__wsg_workspaces'
          ;;
        path)
          _arguments '1:workspace:__wsg_workspaces'
          ;;
        pool)
          _arguments -C \
            '1:pool command:->pool_command' \
            '*::pool arg:->pool_args'
          case $state in
            pool_command)
              _describe 'pool command' pool_commands
              ;;
            pool_args)
              case $words[1] in
                reset)
                  _arguments '1:worker:__wsg_workers'
                  ;;
                create|resize|r)
                  _arguments '1:size:'
                  ;;
              esac
              ;;
          esac
          ;;
        dispatch|d)
          _arguments \
            '--fg[run in foreground]' \
            '--all[dispatch all ready tickets]' \
            '--model[model]:model:(sonnet opus haiku)' \
            '--budget[max spend]:budget:' \
            '--label[label filter]:label:' \
            '*:ticket:'
          ;;
        send|s)
          _arguments \
            '--fg[run in foreground]' \
            '--budget[max spend]:budget:' \
            '1:worker:__wsg_non_busy_workers' \
            '2:prompt:'
          ;;
        review|rev)
          _arguments \
            '--fg[run in foreground]' \
            '--budget[max spend]:budget:' \
            '1:worker:__wsg_non_busy_workers'
          ;;
        mount|m)
          _arguments '1:worker:__wsg_workers'
          ;;
        reset)
          _arguments '1:worker:__wsg_workers'
          ;;
        logs|log)
          _arguments '1:worker:__wsg_workers'
          ;;
      esac
      ;;
  esac
}
compdef _wsg wsg

