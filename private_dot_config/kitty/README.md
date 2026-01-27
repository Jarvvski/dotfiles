# Kitty Terminal Configuration

Modular config mirroring the WezTerm setup. Moonlight theme, JetBrainsMono font, splits-based multiplexing, custom tab bar with status info, and a quick-access dropdown terminal.

## File Structure

```
~/.config/kitty/
├── kitty.conf                      # Entry point (just loads kitty.d/*.conf)
├── quick-access-terminal.conf      # Visor/dropdown terminal overrides
├── tab_bar.py                      # Custom tab bar (Python, required by Kitty)
├── kitty.d/
│   ├── 01-fonts.conf               # JetBrainsMono Nerd Font, size 16
│   ├── 02-theme.conf               # Moonlight color scheme
│   ├── 03-window.conf              # Padding, titlebar, inactive pane dimming
│   ├── 04-tabs.conf                # Bottom tab bar styling
│   ├── 05-keys.conf                # All keybindings
│   ├── 06-layouts.conf             # Splits + stack layouts
│   └── 07-advanced.conf            # Scrollback, remote control, misc
├── sessions/
│   ├── default.session             # Home directory
│   ├── work.session                # ~/work with two tabs
│   ├── personal.session            # ~/personal
│   ├── scratch.session             # /tmp
│   └── monitoring.session          # Home directory
└── README.md                       # This file
```

Files in `kitty.d/` load in alphabetical order. Later files override earlier ones.

## Keyboard Shortcuts

### Text Navigation

| Shortcut | Action |
|----------|--------|
| `Cmd+Left` | Beginning of line |
| `Cmd+Right` | End of line |
| `Alt+Left` | Back one word |
| `Alt+Right` | Forward one word |
| `Cmd+Z` | Undo |
| `Shift+Enter` | Insert newline |

### Pane Management (Splits)

| Shortcut | Action |
|----------|--------|
| `Cmd+T` | Split pane to the right (vertical split) |
| `Cmd+]` | Move to pane on the right |
| `Cmd+[` | Move to pane on the left |
| `Cmd+W` | Close current pane (with confirmation) |
| `Cmd+Shift+Z` | Toggle zoom (stack layout) on current pane |

### Pane Resizing

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+Left` | Make pane narrower |
| `Cmd+Shift+Right` | Make pane wider |
| `Cmd+Shift+Up` | Make pane taller |
| `Cmd+Shift+Down` | Make pane shorter |

### Tab Management

| Shortcut | Action |
|----------|--------|
| `Cmd+1` - `Cmd+9` | Jump to tab 1-9 |
| `Cmd+0` | Jump to tab 10 |
| `Cmd+Shift+T` | New tab (inherits cwd) |
| `Cmd+Shift+[` | Previous tab |
| `Cmd+Shift+]` | Next tab |
| `Cmd+Shift+W` | Close tab |

### Workspace Sessions

| Shortcut | Session |
|----------|---------|
| `Cmd+Ctrl+1` | default |
| `Cmd+Ctrl+2` | personal |
| `Cmd+Ctrl+3` | work |
| `Cmd+Ctrl+4` | scratch |
| `Cmd+Ctrl+5` | monitoring |

Each opens a new OS window with the session layout.

### Other

| Shortcut | Action |
|----------|--------|
| `Cmd+F` | Search scrollback |
| `Cmd+Click` | Open URL |

## Tab Bar

Bottom tab bar with custom Python renderer (`tab_bar.py`).

**Per tab (left side):** workspace digit icon, process icon (context-aware), working directory or process name.

**Right side (last tab):** battery %, Spotify now-playing with progress bar, date and time.

External commands (battery, Spotify) are cached with a 30-second TTL so the tab bar never blocks. Spotify uses the existing `~/.config/wezterm/spotify-progress.applescript`.

## Quick Access Terminal (Visor)

Native dropdown terminal replacing the WezTerm + Hammerspoon visor.

**Toggle:** `kitten quick-access-terminal`

**System-wide hotkey:** macOS Settings > Keyboard > Shortcuts > Services > "Quick access to kitty"

Config in `quick-access-terminal.conf`: drops from top edge, no titlebar, slight transparency (0.95), same padding as main config.

## Theme

Moonlight color scheme ported from WezTerm `theme_warp_dark.lua`:
- Background: `#1A1B27`
- Foreground: `#BBC6F6`
- Cursor: blinking beam, `#B2B2B2`
- Active tab: `#3e68d7` bg, white text
- Inactive tab: `#1e2030` bg, muted text

## Reloading

`Ctrl+Shift+F5` reloads the config. Or restart Kitty.
