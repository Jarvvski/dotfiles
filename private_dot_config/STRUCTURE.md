# Dotfiles Structure Reference

**Last Updated:** 2026-06-02
**System:** macOS (Darwin 24.6.0)
**Shell:** zsh
**Config Management:** chezmoi

---

## Table of Contents

1. [Overview](#overview)
2. [Path Conventions](#path-conventions)
3. [Directory Structure](#directory-structure)
4. [Core Configurations](#core-configurations)
5. [Tool-Specific Details](#tool-specific-details)
6. [Management & Workflow](#management--workflow)

---

## Overview

This dotfiles setup follows the XDG Base Directory specification where possible and uses modular configuration files for maintainability. The primary configuration directory is `~/.config/` with dotfiles managed via chezmoi.

### Key Principles

- **Modularity:** Configurations are split into logical modules (especially ZSH)
- **XDG Compliance:** Uses `$XDG_CONFIG_HOME` for configs, `$XDG_DATA_HOME` for data, `$XDG_CACHE_HOME` for cache
- **Version Control:** Managed with chezmoi + jj (Jujutsu)
- **Performance:** Lazy loading where possible (zsh-defer, lazy.nvim)

---

## Path Conventions

### Environment Variables

```bash
XDG_CONFIG_HOME=/Users/jarvis/.config
XDG_DATA_HOME=/Users/jarvis/.local/share
XDG_CACHE_HOME=/Users/jarvis/.cache
ZDOTDIR=$XDG_CONFIG_HOME/zsh
```

### Important Paths

| Path | Purpose |
|------|---------|
| `~/.config/` | Primary configuration directory |
| `~/.local/share/chezmoi/` | Chezmoi source directory (dotfiles repo) |
| `~/.local/share/mise/` | mise version manager data |
| `~/.local/bin/` | User executables |
| `~/.cache/` | Cache files |
| `/opt/homebrew/` | Homebrew installation (Apple Silicon) |

---

## Directory Structure

```
~/.config/
├── .claude/                    # Claude Code settings
│   └── settings.local.json     # Tool permissions and preferences
│
├── mise/                       # mise version manager config
│   └── config.toml             # global tool versions
│
├── bat/                        # bat (cat replacement) config
│   ├── config                  # bat settings (theme, pager)
│   └── themes/                 # Custom bat themes
│
├── colima/                     # Colima (Docker) configurations
│   ├── default/                # Default Colima profile
│   ├── fast/                   # Fast profile config
│   ├── rosetta/                # Rosetta profile config
│   └── ssh_config              # SSH config for Colima VMs
│
├── docker/                     # Docker CLI configuration
│   ├── config.json             # Docker settings
│   └── contexts/               # Docker contexts
│
├── fd/                         # fd (find replacement) config
│   └── ignore                  # Global ignore patterns
│
├── gh/                         # GitHub CLI config
│   ├── config.yml              # gh settings
│   └── hosts.yml               # GitHub hosts/auth
│
├── git/                        # Git configuration
│   └── config                  # Git global config
│
├── hammerspoon/                # macOS window management
│   └── init.lua                # Main Hammerspoon config (dropdown terminals)
│
├── jj/                         # Jujutsu (VCS) config
│   └── config.toml             # jj settings, aliases, signing
│
├── karabiner/                  # Karabiner Elements (keyboard)
│   └── karabiner.json          # Key remapping rules
│
├── khal/                       # Calendar CLI
│   └── config                  # khal configuration
│
├── kitty/                      # Kitty terminal config
│   └── kitty.conf              # Kitty settings
│
├── linearmouse/                # LinearMouse config
│   └── linearmouse.json        # Mouse settings
│
├── nvim/                       # Neovim configuration
│   ├── init.lua                # Entry point (bootstraps lazy.nvim)
│   ├── init.vim.old            # Old vim config (backup)
│   ├── lazy-lock.json          # Plugin version lockfile
│   └── lua/
│       ├── config/             # Core Neovim settings
│       │   ├── options.lua     # Vim options
│       │   ├── keymaps.lua     # Key mappings
│       │   └── autocmds.lua    # Autocommands
│       └── plugins/            # Plugin specifications
│           ├── ui.lua          # UI plugins (colorscheme, statusline, etc.)
│           ├── editor.lua      # Editor plugins (telescope, nvim-tree, etc.)
│           ├── treesitter.lua  # Syntax highlighting
│           ├── lsp.lua         # LSP configuration
│           ├── completion.lua  # Auto-completion
│           └── terminal.lua    # Terminal integration
│
├── ohmyposh/                   # Oh My Posh prompt theme
│   ├── tokyonight_storm.toml   # Active theme
│   └── zen.toml                # Alternative theme
│
├── raycast/                    # Raycast launcher config
│   ├── config.json             # Raycast settings
│   ├── extensions/             # Custom extensions
│   └── ai/                     # AI integrations
│
├── vdirsyncer/                 # Calendar sync
│   └── config                  # vdirsyncer settings
│
├── wezterm/                    # WezTerm terminal config
│   ├── wezterm.lua             # Main WezTerm config
│   ├── wezterm-visor.lua       # Dropdown terminal config
│   ├── keys.lua                # Key bindings
│   ├── fonts.lua               # Font configuration
│   ├── theme.lua               # Theme imports
│   ├── theme_warp_dark.lua     # Custom theme
│   ├── spotify-progress.applescript  # Status bar integration
│   ├── plugins/                # WezTerm plugins
│   └── .claude/                # Claude context for wezterm
│
├── zsh/                        # ZSH shell configuration
│   ├── .zshrc                  # Main ZSH config (loads modules)
│   ├── zcomet.zsh              # zcomet plugin manager
│   ├── .zcompdump*             # Completion cache
│   ├── .zcomet/                # zcomet plugins directory
│   ├── .zcompcache/            # Completion cache directory
│   └── modules/                # Modular ZSH configuration
│       ├── path.zsh            # PATH management
│       ├── oh-my-posh.zsh      # Prompt setup
│       ├── history.zsh         # History configuration
│       ├── plugins.zsh         # Plugin loading
│       ├── git-aliases.zsh     # Git aliases
│       ├── misc.zsh            # Miscellaneous settings
│       ├── fzf.zsh             # fzf fuzzy finder setup
│       ├── fzf-tab.zsh         # fzf-tab configuration
│       ├── funcs.zsh           # Custom functions
│       ├── khal.zsh            # Calendar integration
│       ├── natural-text-edit.zsh  # Text editing keybinds
│       ├── jj.zsh              # Jujutsu setup
│       ├── auth.zsh            # Authentication/secrets
│       ├── aliases.zsh         # General aliases
│       ├── colima.zsh          # Docker/Colima setup
│       ├── aws.zsh             # AWS CLI setup
│       ├── completion.zsh      # Completion styling
│       └── lazy-load.zsh       # Deferred loading (direnv, zoxide, etc.)
│
├── .claude_context_wezterm.md  # Example context doc
├── AGENTS.md                   # Agent orientation guide (canonical)
├── CLAUDE.md -> AGENTS.md      # Symlink so Claude Code reads the same guide
└── STRUCTURE.md                # This file

```

---

## Core Configurations

### ZSH (Shell)

**Main File:** `~/.config/zsh/.zshrc`

The ZSH configuration is highly modular, with each module serving a specific purpose:

1. **Load Order (Important!):**
   - `path.zsh` - Sets up PATH (must be early)
   - `oh-my-posh.zsh` - Prompt theme
   - `history.zsh` - History settings
   - `plugins.zsh` - Loads zsh plugins via zcomet
   - Various feature modules (git, fzf, jj, colima, etc.)
   - `completion.zsh` - Completion styling
   - **compinit** - Initializes completions
   - `fzf-tab` plugin - Enhanced tab completion
   - `fzf-tab.zsh` - fzf-tab configuration
   - `lazy-load.zsh` - Deferred loading (MUST BE LAST)

2. **Key Modules:**
   - **path.zsh:** Single source of truth for PATH
   - **lazy-load.zsh:** Uses zsh-defer for direnv, zoxide, ldcli
   - **plugins.zsh:** Loads autosuggestions, completions, syntax highlighting
   - **aliases.zsh:** Common shortcuts (ls, git, etc.)
   - **funcs.zsh:** Custom functions (mkcd, extract, etc.)

### WezTerm (Terminal)

**Main Files:**
- `~/.config/wezterm/wezterm.lua` - Normal terminal
- `~/.config/wezterm/wezterm-visor.lua` - Dropdown terminal

**Architecture:**
- Modular design with separate files for keys, fonts, theme
- Two distinct configurations:
  - **Normal:** Full window with titlebar, tabs, status bar
  - **Visor:** Dropdown style, launched via Hammerspoon with `--config-file` flag
- Status bar shows battery and Spotify progress
- Workspace support for organizing terminal sessions

### Neovim (Editor)

**Main File:** `~/.config/nvim/init.lua`

**Plugin Manager:** lazy.nvim

**Structure:**
- `lua/config/` - Core Neovim settings (options, keymaps, autocmds)
- `lua/plugins/` - Plugin specifications (one file per category)
- Uses LSP via mason.nvim for language support
- Treesitter for syntax highlighting
- Telescope for fuzzy finding

### Hammerspoon (Window Management)

**Main File:** `~/.config/hammerspoon/init.lua`

- Provides dropdown terminal functionality
- Keybinding: `Cmd+§` or ``Cmd+` `` to toggle WezTerm visor
- Handles window positioning and space management
- Uses generic handler functions for different terminal apps

---

## Tool-Specific Details

### Package Management

#### Homebrew
- **Location:** `/opt/homebrew/` (Apple Silicon)
- **Brewfile:** `~/.local/share/chezmoi/dot_Brewfile`
- **Update:** `brew update && brew upgrade`

#### mise (Version Manager - replaced asdf/nvm/pyenv on 2026-05-29)
- **Global config:** `~/.config/mise/config.toml` (tracked by chezmoi)
- **Per-project:** `mise.toml` files (e.g. the Ameba monorepo)
- **Data/installs:** `~/.local/share/mise/`
- **Manages:** node, python, go, java, terraform, bun, ruff, age, sops, and cargo/npm/pipx packages (e.g. pay-respects)
- **Activated:** deferred in `zsh/modules/lazy-load.zsh`

#### zcomet (ZSH Plugin Manager)
- **Script:** `~/.config/zsh/zcomet.zsh`
- **Plugins:** `~/.config/zsh/.zcomet/repos/`
- **Auto-updates:** On shell startup

### Development Tools

#### jj (Jujutsu VCS)
- **Config:** `~/.config/jj/config.toml`
- **Used for:** Dotfiles management, development
- **Aliases:** `dotp`, `dotf`, `dotd`, `dotst`, `dotu` (see Dotfile Aliases below)

#### Git
- **Config:** `~/.config/git/config`
- **Still used alongside jj**

#### Docker/Colima
- **Colima profiles:** `~/.config/colima/{default,fast,rosetta}`
- **Docker config:** `~/.config/docker/config.json`

### CLI Utilities

| Tool | Purpose | Config Location |
|------|---------|----------------|
| **bat** | Better cat | `~/.config/bat/config` |
| **fd** | Better find | `~/.config/fd/ignore` |
| **fzf** | Fuzzy finder | `~/.config/zsh/modules/fzf.zsh` |
| **zoxide** | Smart cd | Lazy-loaded in `lazy-load.zsh` |
| **direnv** | Per-directory env | Lazy-loaded in `lazy-load.zsh` |
| **gh** | GitHub CLI | `~/.config/gh/config.yml` |

---

## Management & Workflow

### Chezmoi

Dotfiles are managed with chezmoi, stored in `~/.local/share/chezmoi/`.

**Common Commands:**
```bash
# Check status
chezmoi status

# Apply changes
chezmoi apply

# Edit a file
chezmoi edit ~/.zshrc

# Add a new file
chezmoi add ~/.config/some/file

# Compare changes
chezmoi diff
```

### Dotfile Aliases

Defined in ZSH for quick access:

```bash
dotp "msg"  # re-add into chezmoi source, then jj commit + push
dotf        # pull remote + chezmoi apply
dotd        # show drift (chezmoi status)
dotst       # list tracked files (jj ls in chezmoi repo)
dotu        # run ~/.cron.sh (dotfiles update)
dots        # cd ~/.config
```

### Making Changes

1. **Edit config files directly** in `~/.config/`
2. **Test changes** (restart app, reload config)
3. **Persist:** `dotp "message"` - re-adds into the chezmoi source, then jj commits + pushes in one step

### Backup Strategy

**Version control is the backup.** Do NOT create `*.backup` or timestamped copies
- they drift, get committed by accident, and rot. To checkpoint before a risky
change, commit the current state with `dotp "checkpoint msg"`. To roll back, use jj
in the chezmoi repo: `jj -R ~/.local/share/chezmoi op log` then `op restore <op-id>`.

---

## Special Files

### Claude Code Integration

- **Settings:** `~/.config/.claude/settings.local.json`
- **Context Files:** `~/.config/.claude_context_*.md`
- **Documentation:** `AGENTS.md` (agent guide; `CLAUDE.md` symlinks to it), `STRUCTURE.md` (this file)

### Documentation Files

- **AGENTS.md** - Canonical agent orientation + best-practices guide. `CLAUDE.md` is a symlink to it, so Claude Code and any AGENTS.md-aware tool read the same file.
- **STRUCTURE.md** (this file) - Complete structure reference

---

## Quick Reference

### Find a Config

```bash
# Terminal
~/.config/wezterm/wezterm.lua

# Shell
~/.config/zsh/.zshrc
~/.config/zsh/modules/  # Modular configs

# Editor
~/.config/nvim/init.lua
~/.config/nvim/lua/plugins/  # Plugin specs

# Window Management
~/.config/hammerspoon/init.lua

# Prompt
~/.config/ohmyposh/tokyonight_storm.toml
```

### Reload Configs

```bash
# ZSH
exec zsh

# Neovim
:source $MYVIMRC  # or restart nvim

# WezTerm
# Close and reopen, or use Cmd+R in WezTerm

# Hammerspoon
# Cmd+Ctrl+R or restart Hammerspoon
```

### Debug Performance

```bash
# ZSH startup time
for i in {1..5}; do time zsh -i -c exit; done

# ZSH profiling
PROFILE_ZSH=1 zsh -i -c "zprof | head -20"

# Neovim health check
nvim +checkhealth
```

---

## Notes

- This structure is optimized for macOS (Darwin)
- Paths use XDG conventions where tools support it
- Some tools (like nvim, hammerspoon) can only use `~/.config/`
- ZSH modules are loaded in a specific order - be careful when modifying `.zshrc`
- The visor terminal uses a separate WezTerm config file
- mise manages development tool versions (global + per-project `mise.toml`)
- Completions are compiled for faster startup (`.zwc` files)

---

**For agent best practices when working with these dotfiles, see `AGENTS.md`**
