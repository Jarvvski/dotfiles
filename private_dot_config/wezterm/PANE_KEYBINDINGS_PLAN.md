# WezTerm Pane Management Keybindings - Implementation Plan

**Date**: 2025-10-10
**Target File**: `/Users/jarvis/.config/wezterm/keys.lua`
**Profiles Affected**: Both default (`wezterm.lua`) and visor (`wezterm-visor.lua`)

---

## Executive Summary

Add modern pane management keybindings to WezTerm that work seamlessly with your existing zsh configuration. The changes are isolated to `keys.lua` and will automatically apply to both your default and visor profiles.

---

## Current Configuration Analysis

### WezTerm Structure
- **Main configs**: `wezterm.lua` (default) and `wezterm-visor.lua` (visor mode)
- **Shared keybindings**: Both import `keys.lua` via `keys.setup(config)`
- **Current keys in `keys.lua`**:
  - Cmd+Left/Right → Send Ctrl-A/E (beginning/end of line)
  - Shift+Left/Right → Send Ctrl-A/E (beginning/end of line)
  - Opt+Left/Right → Send Alt-b/f (word navigation)
  - Cmd+Z → Send Ctrl-_ (undo)
  - Shift+Enter → Line continuation with backslash

### Zsh Integration (No Conflicts Found)
- **Relevant module**: `natural-text-edit.zsh` (line 22 of `.zshrc`)
- **How it works**:
  1. WezTerm intercepts Cmd+keys and sends control sequences
  2. Zsh receives those sequences and binds them to readline actions
  3. Pane/tab management is handled entirely by WezTerm (never reaches zsh)
- **No conflicts**: Your new keybindings (Cmd+T, Cmd+[, Cmd+], Cmd+W, Cmd+Shift+W) operate at the WezTerm level and won't interfere with zsh's readline bindings

---

## Proposed Keybindings

### New Pane Management
| Keybinding | Action | WezTerm Action | Notes |
|------------|--------|----------------|-------|
| **Cmd+T** | Split pane to the right | `SplitHorizontal` | Creates new pane in current working directory |
| **Cmd+]** | Activate next pane to the right | `ActivatePaneDirection 'Right'` | Cycles through panes rightward |
| **Cmd+[** | Activate previous pane to the left | `ActivatePaneDirection 'Left'` | Cycles through panes leftward |
| **Cmd+W** | Close current pane | `CloseCurrentPane { confirm = true }` | With confirmation prompt for safety |
| **Cmd+Shift+W** | Close current tab | `CloseCurrentTab { confirm = true }` | With confirmation prompt for safety |

### Tab Navigation (Explicit Addition)
| Keybinding | Action | WezTerm Action | Notes |
|------------|--------|----------------|-------|
| **Cmd+Shift+{** | Previous tab | `ActivateTabRelative(-1)` | Backward tab navigation |
| **Cmd+Shift+}** | Next tab | `ActivateTabRelative(1)` | Forward tab navigation |

### Preserved Existing Keybindings
All current keybindings remain unchanged:
- Cmd+Left/Right (line navigation)
- Shift+Left/Right (line navigation)
- Opt+Left/Right (word navigation)
- Cmd+Z (undo)
- Shift+Enter (line continuation)

---

## Implementation Instructions

### Step 1: Backup Current Configuration
```bash
cp /Users/jarvis/.config/wezterm/keys.lua /Users/jarvis/.config/wezterm/keys.lua.backup
```

### Step 2: Modify `keys.lua`

**Location**: `/Users/jarvis/.config/wezterm/keys.lua`

**Insert after line 35** (after the `Shift+Enter` binding, before the closing `}` of `config.keys`):

```lua
        -- === Pane Management ===
        -- Cmd+T: Split pane to the right
        { key = 't', mods = 'CMD', action = act.SplitHorizontal { domain = 'CurrentPaneDomain' } },

        -- Cmd+]: Navigate to next pane on the right
        { key = ']', mods = 'CMD', action = act.ActivatePaneDirection 'Right' },

        -- Cmd+[: Navigate to previous pane on the left
        { key = '[', mods = 'CMD', action = act.ActivatePaneDirection 'Left' },

        -- Cmd+W: Close current pane (with confirmation)
        { key = 'w', mods = 'CMD', action = act.CloseCurrentPane { confirm = true } },

        -- Cmd+Shift+W: Close current tab (with confirmation)
        { key = 'w', mods = 'CMD|SHIFT', action = act.CloseCurrentTab { confirm = true } },

        -- === Tab Navigation ===
        -- Cmd+Shift+{: Previous tab
        { key = '{', mods = 'CMD|SHIFT', action = act.ActivateTabRelative(-1) },

        -- Cmd+Shift+}: Next tab
        { key = '}', mods = 'CMD|SHIFT', action = act.ActivateTabRelative(1) },
```

### Step 3: Complete Modified File Structure

The final `keys.lua` should look like this:

```lua
local wezterm = require("wezterm")
local act = wezterm.action
local M = {}
-- you can put the rest of your Wezterm config here

function M.setup(config)
    config.leader = { key = "a", mods = "CTRL", timeout_milliseconds = 1000 }
    config.disable_default_key_bindings = false
    config.hyperlink_rules = wezterm.default_hyperlink_rules()

    -- Key bindings for macOS-style shortcuts
    config.keys = {
        -- Cmd+Left: Move to beginning of line (send custom sequence)
        { key = 'LeftArrow', mods = 'CMD', action = act.SendString '\x01' },  -- Ctrl-A

        -- Cmd+Right: Move to end of line (send custom sequence)
        { key = 'RightArrow', mods = 'CMD', action = act.SendString '\x05' },  -- Ctrl-E

        -- Shift+Left: Move to beginning of line (send custom sequence)
        { key = 'LeftArrow', mods = 'SHIFT', action = act.SendString '\x01' },  -- Ctrl-A

        -- Shift+Right: Move to end of line (send custom sequence)
        { key = 'RightArrow', mods = 'SHIFT', action = act.SendString '\x05' },  -- Ctrl-E

        -- Opt+Left: Move backward by word (send Alt-b)
        { key = 'LeftArrow', mods = 'OPT', action = act.SendString '\x1bb' },  -- Alt-b

        -- Opt+Right: Move forward by word (send Alt-f)
        { key = 'RightArrow', mods = 'OPT', action = act.SendString '\x1bf' },  -- Alt-f

        -- Cmd+Z: Undo (send custom sequence)
        { key = 'z', mods = 'CMD', action = act.SendString '\x1f' },  -- Ctrl-_

        -- Shift+Enter: Line continuation with backslash
        { key = 'Enter', mods = 'SHIFT', action = act.SendString ' \\\n' },  -- space + backslash + newline

        -- === Pane Management ===
        -- Cmd+T: Split pane to the right
        { key = 't', mods = 'CMD', action = act.SplitHorizontal { domain = 'CurrentPaneDomain' } },

        -- Cmd+]: Navigate to next pane on the right
        { key = ']', mods = 'CMD', action = act.ActivatePaneDirection 'Right' },

        -- Cmd+[: Navigate to previous pane on the left
        { key = '[', mods = 'CMD', action = act.ActivatePaneDirection 'Left' },

        -- Cmd+W: Close current pane (with confirmation)
        { key = 'w', mods = 'CMD', action = act.CloseCurrentPane { confirm = true } },

        -- Cmd+Shift+W: Close current tab (with confirmation)
        { key = 'w', mods = 'CMD|SHIFT', action = act.CloseCurrentTab { confirm = true } },

        -- === Tab Navigation ===
        -- Cmd+Shift+{: Previous tab
        { key = '{', mods = 'CMD|SHIFT', action = act.ActivateTabRelative(-1) },

        -- Cmd+Shift+}: Next tab
        { key = '}', mods = 'CMD|SHIFT', action = act.ActivateTabRelative(1) },
    }

    config.mouse_bindings = {
        -- Ctrl-click will open the link under the mouse cursor
        {
            event = { Up = { streak = 1, button = "Left" } },
            mods = "CTRL",
            action = wezterm.action.OpenLinkAtMouseCursor,
        },
    }
end

-- return keys and mouse
return M
```

### Step 4: Test the Configuration

**Reload WezTerm** by either:
- Restarting WezTerm completely, or
- Opening a new WezTerm window/tab

**Test each keybinding**:
1. **Cmd+T**: Should split current pane and create a new pane to the right
2. **Cmd+]**: Should move focus to the pane on the right
3. **Cmd+[**: Should move focus to the pane on the left
4. **Cmd+W**: Should prompt to close the current pane
5. **Cmd+Shift+W**: Should prompt to close the current tab
6. **Cmd+Shift+{**: Should switch to the previous tab
7. **Cmd+Shift+}**: Should switch to the next tab

**Verify existing keybindings still work**:
- Cmd+Left/Right (line navigation)
- Opt+Left/Right (word navigation)
- Cmd+Z (undo)

### Step 5: Rollback Plan (If Needed)

If anything breaks or doesn't work as expected:

```bash
# Restore from backup
mv /Users/jarvis/.config/wezterm/keys.lua.backup /Users/jarvis/.config/wezterm/keys.lua

# Reload WezTerm
# (Restart WezTerm or open new window)
```

---

## Why This Won't Break Your Existing Setup

### 1. **No Zsh Conflicts**
- WezTerm intercepts Cmd+keys **before** they reach zsh
- Pane/tab management is purely WezTerm-level functionality
- Your `natural-text-edit.zsh` bindings operate on different keys (arrows, not letters/brackets)

### 2. **No Keybinding Overlaps**
- Existing bindings use: Cmd+arrows, Opt+arrows, Shift+arrows, Cmd+Z, Shift+Enter
- New bindings use: Cmd+T, Cmd+[, Cmd+], Cmd+W, Cmd+Shift+W, Cmd+Shift+{, Cmd+Shift+}
- **Zero overlap**

### 3. **Shared Configuration Benefits**
- Both `wezterm.lua` and `wezterm-visor.lua` call `keys.setup(config)`
- One change → both profiles updated automatically
- Consistent behavior across all WezTerm instances

### 4. **Safety Features**
- Close actions have `confirm = true` → prevents accidental closures
- Non-destructive pane navigation → can't break your session by switching panes
- Split creates new pane in current directory → maintains context

---

## Additional Notes

### Pane vs Tab Terminology
- **Pane**: A split within a single tab (new: Cmd+T, Cmd+[, Cmd+], Cmd+W)
- **Tab**: A separate workspace in the tab bar (existing: Cmd+Shift+{, Cmd+Shift+})

### WezTerm Pane Behavior
- `SplitHorizontal` creates a pane **to the right** (vertical divider)
- New pane inherits the current working directory
- `ActivatePaneDirection` wraps around (rightmost → leftmost when cycling)

### Future Enhancements (Optional)
Consider adding these later if you want more pane control:
- **Cmd+Shift+T**: Split vertically (below current pane)
- **Cmd+Up/Down**: Navigate panes up/down
- **Cmd+Opt+arrows**: Resize panes
- **Cmd+Shift+[/]**: Move pane position

---

## Support & Troubleshooting

### Issue: Keybinding doesn't work
**Check**: Does WezTerm show the binding in the Command Palette (Cmd+Shift+P)?
**Fix**: Verify syntax in `keys.lua` (commas, braces, quotes)

### Issue: Confirmation prompt doesn't appear
**Check**: Is `confirm = true` present in the close actions?
**Fix**: Add `{ confirm = true }` after `CloseCurrentPane` and `CloseCurrentTab`

### Issue: Pane splits vertically instead of horizontally
**Note**: WezTerm terminology is counterintuitive:
- `SplitHorizontal` = splits side-by-side (vertical divider)
- `SplitVertical` = splits top-bottom (horizontal divider)

### Issue: Cmd+W closes entire window
**Check**: Is WezTerm using the updated `keys.lua`?
**Fix**: Restart WezTerm completely (not just new tab)

---

## File Metadata

**Original File**: `/Users/jarvis/.config/wezterm/keys.lua`
**Lines Modified**: Insert after line 35
**Lines Added**: 18 new keybinding entries
**Estimated Implementation Time**: 2-3 minutes
**Risk Level**: Low (non-destructive, easily reversible)

---

**End of Implementation Plan**
