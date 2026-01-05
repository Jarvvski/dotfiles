# fzf-tab configuration
# This must be loaded AFTER fzf-tab plugin is loaded

# Pass all FZF_DEFAULT_OPTS to fzf-tab for consistent theming
zstyle ':fzf-tab:*' fzf-flags $(echo $FZF_DEFAULT_OPTS) --height=50%
zstyle ':fzf-tab:*' fzf-pad 4

# Preview for cd command
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza --tree --color=always $realpath | head -200'

# ============================================
# JJ (Jujutsu) Previews
# ============================================

# Preview for jj commands - show detailed info with author, date, and description
zstyle ':fzf-tab:complete:jj:*' fzf-preview 'jj log -r $word --no-graph --color=always -T "format_short_signature(author) ++ \" \" ++ format_timestamp(committer_timestamp()) ++ \"\n\" ++ description ++ \"\n\" ++ commit_id" 2>/dev/null || echo "Preview not available"'

# Show only change_id in the completion list itself (override verbose template)
zstyle ':fzf-tab:complete:jj:*' prefix ''
zstyle ':completion::complete:jj-edit:-r-*:' command 'jj log --no-graph --color=always -T "change_id.short()"'

# Preview for nvim/vim - show file contents or directory tree
zstyle ':fzf-tab:complete:(nvim|vim|vi):*' fzf-preview 'if [ -d $realpath ]; then eza --tree --color=always $realpath | head -200; else bat -n --color=always --line-range :500 $realpath 2>/dev/null || cat $realpath; fi'

# Preview for all other commands
zstyle ':fzf-tab:complete:*:*' fzf-preview 'if [ -d $realpath ]; then eza --tree --color=always $realpath | head -200; else bat -n --color=always --line-range :500 $realpath; fi'
