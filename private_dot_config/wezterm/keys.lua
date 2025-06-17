local wezterm = require("wezterm")
local M = {}
-- you can put the rest of your Wezterm config here

function M.setup(config)
    config.leader = { key = "a", mods = "CTRL", timeout_milliseconds = 1000 }
    config.disable_default_key_bindings = false
    config.hyperlink_rules = wezterm.default_hyperlink_rules()
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
