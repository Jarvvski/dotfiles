# Load zsh-defer first for lazy loading support
zcomet load romkatv/zsh-defer

# Core plugins
zcomet load ohmyzsh plugins/gitfast
zcomet load ohmyzsh plugins/colorize
zcomet load ohmyzsh plugins/zsh-interactive-cd

# Quality of life plugins
zcomet load zsh-users/zsh-completions

# Syntax highlighting and autosuggestions must be loaded LAST
zcomet load zsh-users/zsh-autosuggestions
zcomet load zsh-users/zsh-syntax-highlighting
export ZSH_AUTOSUGGEST_STRATEGY=(history completion)
export ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
export ZSH_AUTOSUGGEST_USE_ASYNC=1
