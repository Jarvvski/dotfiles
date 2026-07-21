# NOTE: do not hardcode TERM here - modern terminals (WezTerm, Ghostty, Kitty)
# advertise their own TERM (xterm-kitty, etc.) enabling truecolor + undercurl.
export CASE_SENSITIVE="false"

# common exports
export VISUAL=nvim;
export EDITOR=nvim;

# GCP
export USE_GKE_GCLOUD_AUTH_PLUGIN=True

# generic 'clear up home dir' exports
export NODE_REPL_HISTORY="$XDG_STATE_HOME/node_repl_history"
export KONAN_DATA_DIR="$XDG_DATA_HOME/konan"
export GRADLE_USER_HOME="$XDG_DATA_HOME/gradle"
export DOCKER_CONFIG="$XDG_CONFIG_HOME/docker"
export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-$XDG_CONFIG_HOME/pi}"
export LS_COLORS="di=1;36:ln=35:so=32:pi=33:ex=31:bd=34;46:cd=34;43:su=30;41:sg=30;46:tw=30;42:ow=30;43"

# zoxide exclusions
export _ZO_EXCLUDE_DIRS="$HOME/Code/ameba/mono-workspaces/*"

# open files
ulimit -n 10240
