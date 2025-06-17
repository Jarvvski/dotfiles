local wezterm = require("wezterm")

local M = {}

function M.setup(config)
    config.font = wezterm.font_with_fallback({
      { family = "JetBrainsMono Nerd Font Mono", weight = "Medium" },
      { family = "Iosevka Nerd Font Mono" },
    })

    config.font_size = 16.0
    config.line_height = 1.1 -- 1.1 adds spacing if you feel cramped
    config.cell_width = 1.1  -- increase slightly if Kitty feels roomier
    config.adjust_window_size_when_changing_font_size = false
    config.underline_thickness = "200%"
    config.underline_position = "-3pt"
    config.window_frame = {
        font = wezterm.font({ family = "Monaspace Neon Frozen", weight = "Regular" }),
        font_size = 16.0,
    }
    config.warn_about_missing_glyphs = true
end

return M
