local wezterm = require("wezterm")


local M = {}

function M.setup(config)

    config.set_environment_variables = {
        WEZTERM_DISABLE_DYNAMIC_TITLE = "1"
    }

    config.default_cursor_style = "BlinkingBar"
    config.cursor_blink_rate = 800

    config.colors = {
        -- The default text color
        foreground = '#ffffff',
        -- The default background color
        background = '#000000',

        -- Overrides the cell background color when the current cell is occupied by the
        -- cursor and the cursor style is set to Block
        cursor_bg = '#ffffff',
        -- Overrides the text color when the current cell is occupied by the cursor
        cursor_fg = '#000000',
        -- Specifies the border color of the cursor when the cursor style is set to Block,
        -- or the color of the vertical or horizontal bar when the cursor style is set to
        -- Bar or Underline.
        cursor_border = '#00c2ff',

        -- the foreground color of selected text
        selection_fg = '#ffffff',
        -- the background color of selected text
        selection_bg = '#616161',

        -- The color of the scrollbar "thumb"; the portion that represents the current viewport
        scrollbar_thumb = '#616161',

        ansi = {
            '#616161', -- black
            '#ff5555', -- red (more saturated)
            '#50fa7b', -- green (more vibrant)
            '#f1fa8c', -- yellow (brighter)
            '#66d9ef', -- blue (more saturated)
            '#ff79c6', -- magenta (more vibrant)
            '#8be9fd', -- cyan (brighter)
            '#f1f1f1', -- white
        },
        brights = {
            '#8e8e8e', -- bright black
            '#ff6e6e', -- bright red (deeper)
            '#69ff94', -- bright green (brighter)
            '#ffffa5', -- bright yellow (more vivid)
            '#89ddff', -- bright blue (brighter)
            '#ff92df', -- bright magenta (more vivid)
            '#a4ffff', -- bright cyan (brighter)
            '#feffff', -- bright white
        },

        tab_bar = {
            background = "#000000", -- bar background (matches terminal)

            active_tab = {
                bg_color = "#303030",      -- dark gray tab
                fg_color = "#ffffff",      -- white text
                intensity = "Bold",
                underline = "None",
                italic = false,
                strikethrough = false,
            },

            inactive_tab = {
                bg_color = "#000000",      -- terminal background
                fg_color = "#f1f1f1",      -- soft white
            },

            inactive_tab_hover = {
                bg_color = "#000000",      -- no change on hover
                fg_color = "#00c2ff",      -- accent color on hover
                italic = true,
            },

            new_tab = {
                bg_color = "#000000",
                fg_color = "#00c2ff",
            },

            new_tab_hover = {
                bg_color = "#303030",
                fg_color = "#ffffff",
                italic = true,
            },
        }
    }
    config.enable_scroll_bar = false

    config.tab_bar_at_bottom = false
    config.use_fancy_tab_bar = false
    config.tab_and_split_indices_are_zero_based = true

    config.scrollback_lines = 50000
    config.default_workspace = "default"
    config.hide_tab_bar_if_only_one_tab = false
    config.show_new_tab_button_in_tab_bar = false
    config.show_close_tab_button_in_tabs = false
    config.show_tab_index_in_tab_bar = false
    config.tab_bar_at_bottom = true

    config.window_frame = {
        font_size = 16.0,
        active_titlebar_bg = "#000000",
        inactive_titlebar_bg = "#000000",
        -- Adds padding around the tab bar/titlebar area
        border_left_width = 4,
        border_right_width = 4,
        border_bottom_height = 0,
        border_top_height = 4,
    }
end

-- return keys and mouse
return M
