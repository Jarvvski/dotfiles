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
        foreground = '#BBC6F6',
        -- The default background color
        background = '#1A1B27',

        -- Overrides the cell background color when the current cell is occupied by the
        -- cursor and the cursor style is set to Block
        cursor_bg = '#B2B2B2',
        -- Overrides the text color when the current cell is occupied by the cursor
        cursor_fg = '#292733',
        -- Specifies the border color of the cursor when the cursor style is set to Block,
        -- or the color of the vertical or horizontal bar when the cursor style is set to
        -- Bar or Underline.
        cursor_border = '#52ad70',

        -- the foreground color of selected text
        selection_fg = '#444257',
        -- the background color of selected text
        selection_bg = '#C4B5FF',

        -- The color of the scrollbar "thumb"; the portion that represents the current viewport
        scrollbar_thumb = '#222222',

        ansi = {
            '#2A2734',
            '#E2514E',
            '#00BCDB',
            '#E1C381',
            '#5334B2',
            '#E69F51',
            '#2AB7E7',
            '#9B84EE',
        },
        brights = {
            '#454159',
            '#E2514E',
            '#4EF4DF',
            '#E1C381',
            '#7B64C3',
            '#E69F51',
            '#24D5F8',
            '#EEEBFF',
        },

        tab_bar = {
            background = "#1A1B27", -- bar background (matches terminal)

            active_tab = {
                bg_color = "#303030",      -- dark gray tab
                fg_color = "#FFFFFF",      -- white/light text
                intensity = "Bold",
                underline = "None",
                italic = false,
                strikethrough = false,
            },

            inactive_tab = {
                bg_color = "#1A1B27",      -- terminal background
                fg_color = "#BBC6F6",      -- soft light blue
            },

            inactive_tab_hover = {
                bg_color = "#1A1B27",      -- no change on hover
                fg_color = "#C4B5FF",      -- subtle hover color
                italic = true,
            },

            new_tab = {
                bg_color = "#1A1B27",
                fg_color = "#9B84EE",
            },

            new_tab_hover = {
                bg_color = "#2A2734",
                fg_color = "#ffffff",
                italic = true,
            },
        }
    }
    config.enable_scroll_bar = false

    config.tab_bar_at_bottom = false
    config.use_fancy_tab_bar = false
    config.tab_and_split_indices_are_zero_based = true

    config.window_decorations = "RESIZE"
    config.scrollback_lines = 3000
    config.default_workspace = "home"
    config.hide_tab_bar_if_only_one_tab = false
    config.show_new_tab_button_in_tab_bar = false
    config.show_close_tab_button_in_tabs = false
    config.show_tab_index_in_tab_bar = false
    config.tab_bar_at_bottom = true

    config.window_frame = {
        font_size = 16.0,
        active_titlebar_bg = "#1A1B27",
        inactive_titlebar_bg = "#1A1B27",
        -- Adds padding around the tab bar/titlebar area
        border_left_width = 4,
        border_right_width = 4,
        border_bottom_height = 0,
        border_top_height = 4,
    }
end

-- return keys and mouse
return M
