return {
  {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
      -- Replaces nvim-notify.
      notifier = { enabled = true },

      -- Replaces toggleterm. Keymaps below mirror the old bindings.
      terminal = {},

      -- Replaces alpha-nvim; keeps the original NEOVIM ASCII header + buttons.
      dashboard = {
        enabled = true,
        preset = {
          header = table.concat({
            "",
            "",
            " ███╗   ██╗███████╗ ██████╗ ██╗   ██╗██╗███╗   ███╗",
            " ████╗  ██║██╔════╝██╔═══██╗██║   ██║██║████╗ ████║",
            " ██╔██╗ ██║█████╗  ██║   ██║██║   ██║██║██╔████╔██║",
            " ██║╚██╗██║██╔══╝  ██║   ██║╚██╗ ██╔╝██║██║╚██╔╝██║",
            " ██║ ╚████║███████╗╚██████╔╝ ╚████╔╝ ██║██║ ╚═╝ ██║",
            " ╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═══╝  ╚═╝╚═╝     ╚═╝",
            "",
            "",
          }, "\n"),
          keys = {
            { icon = " ", key = "f", desc = "Find file", action = ":Telescope find_files" },
            { icon = " ", key = "e", desc = "New file", action = ":ene | startinsert" },
            { icon = " ", key = "r", desc = "Recent files", action = ":Telescope oldfiles" },
            { icon = " ", key = "g", desc = "Find text", action = ":Telescope live_grep" },
            { icon = " ", key = "c", desc = "Config", action = ":e ~/.config/nvim/init.lua" },
            { icon = " ", key = "q", desc = "Quit", action = ":qa" },
          },
        },
        sections = {
          { section = "header" },
          { section = "keys", gap = 1, padding = 1 },
        },
      },
    },
    init = function()
      -- Reopen the start screen after editing (`:q` closes nvim, like alpha did).
      vim.api.nvim_create_user_command("Dashboard", function()
        Snacks.dashboard.open()
      end, { desc = "Open the snacks dashboard" })
    end,
    keys = {
      { "<leader>;", function() Snacks.dashboard.open() end, desc = "Dashboard (start screen)" },
      { "<C-\\>", function() Snacks.terminal.toggle() end, mode = { "n", "t" }, desc = "Toggle terminal" },
      { "<leader>tf", function() Snacks.terminal.toggle(nil, { win = { position = "float" } }) end, desc = "Float terminal" },
      { "<leader>th", function() Snacks.terminal.toggle(nil, { win = { position = "bottom" } }) end, desc = "Horizontal terminal" },
      { "<leader>tv", function() Snacks.terminal.toggle(nil, { win = { position = "right" } }) end, desc = "Vertical terminal" },
    },
  },
}
