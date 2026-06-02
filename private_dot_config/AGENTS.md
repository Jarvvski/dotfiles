# AGENTS.md - Agent Guide for ~/.config

> Canonical agent-orientation file for this dotfiles tree. `CLAUDE.md` is a
> symlink to this file, so Claude Code, Cursor, and any AGENTS.md-aware tool
> all read the same guide. **Edit `AGENTS.md`, never the symlink.**

## TL;DR for a new agent

- macOS dotfiles tree managed by **chezmoi** (source: `~/.local/share/chezmoi/`)
  with **jj (Jujutsu), not git** as the VCS. Never run raw `git` here.
- Layout follows **XDG**: `$XDG_CONFIG_HOME=~/.config`, `$ZDOTDIR=~/.config/zsh`.
- **Version control is the backup.** Do NOT create `*.backup` copies. To
  checkpoint before a risky change, commit: `dotp "checkpoint msg"`. To roll
  back: `jj -R ~/.local/share/chezmoi op log` then `op restore <op-id>`.
- Read before editing, match existing style, then test by reloading the
  affected app (see table below).
- Deeper references: `STRUCTURE.md` (full layout) and
  `DOTFILES_IMPROVEMENT_PLAN.md` (roadmap). The complete best-practices guide is
  folded in at the bottom of this file.

## Where things live (map)

The file to edit for each area:

| Area | Canonical file(s) |
|---|---|
| Shell (zsh) | `zsh/.zshrc` sources `zsh/modules/*.zsh` in a fixed order |
| Aliases | `zsh/modules/aliases.zsh` (git aliases in `git-aliases.zsh`) |
| Shell functions | `zsh/modules/funcs.zsh` |
| Prompt | `ohmyposh/tokyonight_storm.toml` (active theme) |
| Editor | `nvim/init.lua` -> `nvim/lua/config/*` + `nvim/lua/plugins/*` |
| Terminals | `wezterm/wezterm.lua` (normal) + `wezterm/wezterm-visor.lua` (dropdown); also `kitty/`, `ghostty/`, `iterm2/`, `zed/` |
| Window mgmt | `hammerspoon/init.lua` (dropdown-terminal toggle) |
| VCS | `jj/config.toml`, `git/config` |
| Containers | `colima/{default,fast,rosetta}`, `docker/config.json` |
| Tool versions | `mise/config.toml` (mise replaced asdf/nvm/pyenv) |
| Keyboard / mouse | `karabiner/karabiner.json`, `linearmouse/linearmouse.json` |
| CLI utils | `bat/config`, `fd/ignore`, `gh/config.yml`, `khal/`, `vdirsyncer/` |
| Claude Code | `.claude/settings.local.json`, per-tool `*/.claude/`, `.claude_context_*.md` |

`ls ~/.config` shows the full set; most subdirs are self-describing,
single-tool configs.

## Conventions that matter

- **zsh is modular and load-order-sensitive.** `.zshrc` loads modules via
  `zcomet snippet`. `path.zsh` runs early; `lazy-load.zsh` MUST stay last. Add
  aliases to `aliases.zsh`, functions to `funcs.zsh` - keep module boundaries
  (no PATH edits in `lazy-load.zsh`, no aliases in `path.zsh`, etc.).
- **Completions are compiled** to `.zwc`. The plaintext `.zsh`/module is the
  source of truth; the `.zwc` regenerates - never hand-edit it.
- **chezmoi + jj workflow.** Most root `*.md` docs here (this file,
  `STRUCTURE.md`, `DOTFILES_IMPROVEMENT_PLAN.md`) are local-only and NOT
  chezmoi-tracked; the tool configs under each subdir ARE. To persist a config
  change:
  - `dotd` - show drift (`chezmoi status`).
  - `dotp "msg"` - re-add into the chezmoi source, then jj commit + push.
    It always `chezmoi re-add`s first so the source never silently drifts.
  - `dotf` - pull remote + `chezmoi apply`.
  - `dotst` - list tracked files (jj ls in the chezmoi repo).
- **Two WezTerm configs:** normal vs visor (dropdown, launched by Hammerspoon
  with `--config-file`). Always confirm which one a change targets.

## Verifying a change

| Changed | Reload |
|---|---|
| zsh | `exec zsh` (alias `reload`) |
| nvim | `:source $MYVIMRC` or restart |
| WezTerm | Cmd+R or reopen |
| Hammerspoon | Cmd+Ctrl+R |

Syntax-check zsh without sourcing: `zsh -n <file>`. Profile startup:
`PROFILE_ZSH=1 zsh -i -c "zprof | head -20"`.

---

> The section below is the original `claude.md` best-practices guide, folded in
> verbatim so nothing is lost. Where it mentions creating `*.backup` copies,
> prefer the authoritative policy above: **version control is the backup** (use
> `dotp` / `jj op restore`).

---

# Claude Code Best Practices for Dotfiles Management

**Version:** 1.0
**Last Updated:** 2025-10-24
**System:** macOS + ZSH + WezTerm

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Path Setup](#path-setup)
3. [Working with This Dotfiles Setup](#working-with-this-dotfiles-setup)
4. [Best Practices](#best-practices)
5. [Common Tasks](#common-tasks)
6. [Context Documentation](#context-documentation)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### On Every New Conversation

When starting a new Claude Code conversation in this dotfiles directory, remember:

1. **Read the structure first:**
   ```bash
   # The complete reference is at:
   ~/.config/STRUCTURE.md
   ```

2. **Key paths to know:**
   - Config directory: `/Users/jarvis/.config/` (or `~/.config/`)
   - ZSH configs: `~/.config/zsh/` (modules in `modules/` subdirectory)
   - WezTerm: `~/.config/wezterm/`
   - Neovim: `~/.config/nvim/`
   - Chezmoi source: `~/.local/share/chezmoi/`

3. **Environment variables:**
   ```bash
   XDG_CONFIG_HOME=/Users/jarvis/.config
   ZDOTDIR=$XDG_CONFIG_HOME/zsh
   ```

---

## Path Setup

### Important Path Conventions

This dotfiles setup follows XDG Base Directory specifications:

| Variable | Path | Purpose |
|----------|------|---------|
| `$XDG_CONFIG_HOME` | `/Users/jarvis/.config` | Configuration files |
| `$XDG_DATA_HOME` | `/Users/jarvis/.local/share` | Data files |
| `$XDG_CACHE_HOME` | `/Users/jarvis/.cache` | Cache files |
| `$ZDOTDIR` | `$XDG_CONFIG_HOME/zsh` | ZSH configuration |
| `$HOME` | `/Users/jarvis` | User home directory |

### Always Use Full Paths

When reading or editing files, use absolute paths:

**Good:**
```bash
/Users/jarvis/.config/zsh/modules/aliases.zsh
~/.config/wezterm/wezterm.lua
```

**Avoid:**
```bash
./aliases.zsh  # Too ambiguous
../zsh/.zshrc  # Relative paths can be confusing
```

---

## Working with This Dotfiles Setup

### Understanding the Structure

Before making any changes:

1. **Read STRUCTURE.md** - Complete reference of all configs
2. **Check for context files** - Look for `.claude_context_*.md` files in relevant directories
3. **Understand the tool** - Know what the config affects

### Modular Configuration

This setup uses modular configs, especially for ZSH:

```
~/.config/zsh/
├── .zshrc              # Main file - loads modules in order
└── modules/            # Individual feature modules
    ├── path.zsh        # PATH management
    ├── aliases.zsh     # Aliases
    ├── plugins.zsh     # Plugin loading
    └── ...
```

**Important:** ZSH modules are loaded in a specific order. Always check `.zshrc` to understand dependencies before modifying.

### Two WezTerm Configs

There are **TWO separate WezTerm configurations:**

1. **Normal terminal:** `wezterm.lua` - Standard window with titlebar
2. **Visor/dropdown:** `wezterm-visor.lua` - Launched via Hammerspoon with `--config-file` flag

When editing WezTerm settings, always confirm which config to modify.

---

## Best Practices

### 1. Version Control IS Your Backup (do NOT make .backup copies)

This setup is tracked by chezmoi + jj. That is the safety net - do **not**
create `*.backup` or timestamped `*.backup.YYYYMMDD` copies. They drift, get
committed by accident, and rot (several were cleaned out on 2026-05-29).

To checkpoint before a risky change, commit the current state instead:
```bash
dotp "checkpoint before nvim lsp rework"   # re-add + commit + push
```
To roll back a bad change, use jj in the chezmoi repo (working copy is always a commit):
```bash
jj -R ~/.local/share/chezmoi op log     # find the point to restore
jj -R ~/.local/share/chezmoi op restore <op-id>
```

### 2. Read Before Editing

Always read the entire file or relevant sections before making changes:

```bash
# Read the full file first
Read ~/.config/zsh/.zshrc

# Then edit specific sections
Edit ~/.config/zsh/.zshrc ...
```

### 3. Test Changes Immediately

After editing:

1. **Reload the config:**
   - ZSH: `exec zsh` or open new terminal
   - Neovim: `:source $MYVIMRC` or restart
   - WezTerm: Restart or use Cmd+R
   - Hammerspoon: Cmd+Ctrl+R

2. **Verify it works:**
   - Test the specific feature you changed
   - Check for error messages
   - Verify nothing else broke

3. **Roll back if needed:**
   - Use the backup you created
   - Or use git/jj to revert

### 4. Maintain Module Boundaries

Don't mix concerns:

**Good:**
- PATH management → `path.zsh`
- Aliases → `aliases.zsh`
- Lazy loading → `lazy-load.zsh`

**Bad:**
- Adding aliases to `path.zsh`
- PATH modifications in `lazy-load.zsh`
- Plugin loading in `misc.zsh`

### 5. Preserve Load Order

ZSH modules must load in the correct order:

1. Path setup (early)
2. Prompt
3. History, plugins
4. Features (git, fzf, jj, colima, etc.)
5. Completion configuration
6. **compinit** (completion initialization)
7. fzf-tab plugin
8. fzf-tab configuration
9. **Lazy-load (MUST BE LAST)**

Never move `lazy-load.zsh` earlier in the load order.

### 6. Use Chezmoi for Persistence

After testing changes:

```bash
# Add modified file to chezmoi
chezmoi add ~/.config/zsh/.zshrc

# Commit changes
cd ~/.local/share/chezmoi
jj describe -m "fix: update zsh aliases"

# Push changes
jj push
```

### 7. Document Complex Changes

When making significant changes, create or update context files:

```bash
~/.config/.claude_context_<tool>.md
```

See [Context Documentation](#context-documentation) section below.

---

## Common Tasks

### Modifying ZSH Configuration

**Adding a new alias:**

1. Read `~/.config/zsh/modules/aliases.zsh`
2. Add alias to the appropriate section
3. Reload: `exec zsh`
4. Test the alias
5. Add to chezmoi: `chezmoi add ~/.config/zsh/modules/aliases.zsh`

**Adding a new module:**

1. Create `~/.config/zsh/modules/newmodule.zsh`
2. Add content to the file
3. Edit `~/.config/zsh/.zshrc` to load the module:
   ```bash
   zcomet snippet "$ZDOTDIR/modules/newmodule.zsh"
   ```
4. Place it in the correct load order
5. Reload and test: `exec zsh`
6. Add both files to chezmoi

### Configuring WezTerm

**Which config to edit?**

- **Normal terminal behavior:** Edit `wezterm.lua`
- **Dropdown terminal:** Edit `wezterm-visor.lua`
- **Keybindings:** Edit `keys.lua` (loaded by both configs)
- **Fonts:** Edit `fonts.lua`
- **Theme:** Edit `theme.lua` or `theme_warp_dark.lua`

**Making changes:**

1. Read relevant config file
2. Make changes
3. Restart WezTerm or reload with Cmd+R
4. Test thoroughly
5. Add to chezmoi

### Adding Neovim Plugins

1. Create or edit file in `~/.config/nvim/lua/plugins/`
2. Add plugin specification:
   ```lua
   return {
     {
       "author/plugin-name",
       config = function()
         require("plugin-name").setup({
           -- config here
         })
       end,
     },
   }
   ```
3. Restart Neovim or run `:Lazy sync`
4. Test plugin functionality
5. Add to chezmoi: `chezmoi add ~/.config/nvim/lua/plugins/filename.lua`

### Updating Hammerspoon

1. Read `~/.config/hammerspoon/init.lua`
2. Make changes (add keybindings, functions, etc.)
3. Reload: Cmd+Ctrl+R or restart Hammerspoon
4. Test the changes
5. Check Hammerspoon console for errors
6. Add to chezmoi

---

## Context Documentation

### What Are Context Files?

Context files provide Claude Code with persistent information about specific tools or configurations. They help future Claude sessions understand:

- The current state of a configuration
- Problems that were solved
- Important details about the setup
- Decisions that were made

### Example: .claude_context_wezterm.md

See `~/.config/.claude_context_wezterm.md` for a good example. It documents:

- The specific problem (titlebar not showing)
- The dual WezTerm configuration setup
- What was changed and why
- Valid configuration options
- How to test the fix

### When to Create Context Files

Create a context file when:

1. **Solving a complex problem** that might recur
2. **Setting up a non-obvious configuration** (like dual WezTerm configs)
3. **Making architectural decisions** that future Claude needs to know
4. **Documenting workarounds** or system-specific quirks

### Context File Template

```markdown
# [Tool] Configuration Context

## Problem/Goal
[What you're trying to accomplish or fix]

## Setup
[Current configuration state]

## What Was Changed
[Specific changes made]

## Important Details
[Key information for future reference]

## How to Test
[Verification steps]

## Notes
[Additional context, gotchas, references]
```

### Context File Naming

Use clear, descriptive names:

```
.claude_context_wezterm.md       # WezTerm configuration
.claude_context_zsh_modules.md   # ZSH module system
.claude_context_nvim_lsp.md      # Neovim LSP setup
```

### Updating Context Files

When the situation changes:

1. Read the existing context file
2. Update relevant sections
3. Add timestamp or version info
4. Keep historical information if useful

---

## Troubleshooting

### ZSH Issues

**Slow startup:**
```bash
# Profile startup
PROFILE_ZSH=1 zsh -i -c "zprof | head -20"

# Time startup
for i in {1..5}; do time zsh -i -c exit; done
```

**Broken configuration:**
```bash
# Start with minimal config
zsh -f

# Reload config
exec zsh

# Check for syntax errors
zsh -n ~/.config/zsh/.zshrc
```

**Completion not working:**
```bash
# Clear completion cache
rm -rf ~/.config/zsh/.zcompdump*
rm -rf ~/.cache/zsh/*

# Reload
exec zsh
```

### WezTerm Issues

**Config not loading:**
```bash
# Check which config is being used
# Look at window title or run in WezTerm:
wezterm show-keys

# Verify config file exists
ls -la ~/.config/wezterm/wezterm.lua
```

**Visor not working:**
```bash
# Check Hammerspoon console for errors
# Verify the visor config exists
ls -la ~/.config/wezterm/wezterm-visor.lua

# Test launching manually
open -b com.github.wez.wezterm.visor --args --config-file ~/.config/wezterm/wezterm-visor.lua
```

### Neovim Issues

**Plugins not loading:**
```bash
# Check health
nvim +checkhealth

# Sync plugins
nvim +Lazy sync

# View logs
nvim ~/.local/state/nvim/lazy.log
```

**LSP not working:**
```bash
# Check LSP status
nvim +LspInfo

# Reinstall servers
nvim +Mason
```

### Chezmoi Issues

**Changes not applying:**
```bash
# Check status
chezmoi status

# See differences
chezmoi diff

# Force apply
chezmoi apply --force
```

**Conflicts:**
```bash
# See what's different
chezmoi diff

# Re-add file from system
chezmoi add ~/.config/some/file

# Or edit in chezmoi
chezmoi edit ~/.config/some/file
```

---

## File Reference Quick Links

### Essential Files

- **This guide:** `~/.config/claude.md`
- **Structure reference:** `~/.config/STRUCTURE.md`
- **Improvement plan:** `~/.config/DOTFILES_IMPROVEMENT_PLAN.md`

### Core Configs

- **ZSH main:** `~/.config/zsh/.zshrc`
- **ZSH modules:** `~/.config/zsh/modules/`
- **WezTerm normal:** `~/.config/wezterm/wezterm.lua`
- **WezTerm visor:** `~/.config/wezterm/wezterm-visor.lua`
- **Neovim:** `~/.config/nvim/init.lua`
- **Hammerspoon:** `~/.config/hammerspoon/init.lua`

### Management

- **Chezmoi source:** `~/.local/share/chezmoi/`
- **Brewfile:** `~/.local/share/chezmoi/dot_Brewfile`

---

## Tips for Claude Code

### When Starting a Task

1. **Read STRUCTURE.md** to understand the layout
2. **Check for context files** in the relevant directory
3. **Read the current config** before making changes
4. **Create a backup** if making significant changes
5. **Use absolute paths** consistently

### When Editing Files

1. **Read first:** Always read the full file or relevant sections
2. **Understand context:** Check surrounding code and comments
3. **Preserve formatting:** Match existing style and indentation
4. **Test immediately:** Verify changes work as expected
5. **Document if needed:** Update or create context files

### When Something Goes Wrong

1. **Check error messages** carefully
2. **Consult troubleshooting section** in this file
3. **Review recent changes** (use git/jj log)
4. **Test in isolation** (minimal config)
5. **Restore from backup** if necessary

### Communication

- **Be specific** about which config you're modifying
- **Explain changes** and their rationale
- **Provide test steps** after making changes
- **Mention any gotchas** or important details
- **Update documentation** when structure changes

---

## Remember

- This dotfiles setup is **modular and organized**
- Changes should be **tested before committing**
- Use **chezmoi for persistence**
- Keep **context documentation updated**
- Always **back up before major changes**
- **Load order matters** especially in ZSH
- There are **two WezTerm configs** (normal and visor)
- **STRUCTURE.md** is your reference guide

---

## Additional Resources

- **WezTerm Docs:** https://wezfurlong.org/wezterm/
- **Neovim Docs:** https://neovim.io/doc/
- **ZSH Manual:** https://zsh.sourceforge.io/Doc/
- **Chezmoi Docs:** https://www.chezmoi.io/
- **Hammerspoon API:** https://www.hammerspoon.org/docs/

---

**Last Updated:** 2025-10-24
**Maintainer:** jarvis (with Claude Code assistance)

For complete structure reference, see: `~/.config/STRUCTURE.md`
