return {
  {
    "saghen/blink.cmp",
    -- lsp.lua pulls in blink's LSP capabilities at startup, so blink loads
    -- eagerly; its Rust matcher keeps that cheap. version pins the prebuilt
    -- release binary (no local cargo build required).
    event = "InsertEnter",
    version = "1.*",
    dependencies = { "rafamadriz/friendly-snippets" },
    opts = {
      -- Preserve the exact nvim-cmp keymaps this config used before.
      keymap = {
        preset = "none",
        ["<C-k>"] = { "select_prev", "fallback" },
        ["<C-j>"] = { "select_next", "fallback" },
        ["<C-b>"] = { "scroll_documentation_up", "fallback" },
        ["<C-f>"] = { "scroll_documentation_down", "fallback" },
        ["<C-Space>"] = { "show", "show_documentation", "hide_documentation" },
        ["<C-e>"] = { "hide", "fallback" },
        ["<CR>"] = { "accept", "fallback" },
      },
      appearance = {
        nerd_font_variant = "mono",
      },
      completion = {
        menu = {
          border = "rounded",
          winhighlight = "Normal:Normal,FloatBorder:FloatBorder,CursorLine:PmenuSel,Search:None",
          draw = { treesitter = { "lsp" } },
        },
        documentation = {
          auto_show = true,
          auto_show_delay_ms = 200,
          window = { border = "rounded" },
        },
        ghost_text = { enabled = false },
      },
      sources = {
        default = { "lsp", "path", "snippets", "buffer", "lazydev" },
        providers = {
          lazydev = {
            name = "LazyDev",
            module = "lazydev.integrations.blink",
            score_offset = 100,
          },
        },
      },
      fuzzy = { implementation = "prefer_rust_with_warning" },
      signature = { enabled = false },
    },
    opts_extend = { "sources.default" },
    config = function(_, opts)
      require("blink.cmp").setup(opts)

      -- Port the transparent / moonlight completion styling from nvim-cmp.
      vim.api.nvim_set_hl(0, "BlinkCmpMenu", { bg = "NONE", fg = "#c8d3f5" })
      vim.api.nvim_set_hl(0, "BlinkCmpMenuBorder", { bg = "NONE" })
      vim.api.nvim_set_hl(0, "BlinkCmpMenuSelection", { bg = "#3e68d7", fg = "#ffffff", bold = true })
      vim.api.nvim_set_hl(0, "BlinkCmpScrollBarThumb", { bg = "#3e68d7" })
      vim.api.nvim_set_hl(0, "BlinkCmpScrollBarGutter", { bg = "#1e2030" })
      vim.api.nvim_set_hl(0, "BlinkCmpLabelMatch", { fg = "#82aaff", bold = true })
      vim.api.nvim_set_hl(0, "BlinkCmpKind", { fg = "#c099ff" })
      vim.api.nvim_set_hl(0, "BlinkCmpLabelDescription", { fg = "#828bb8" })
      vim.api.nvim_set_hl(0, "BlinkCmpDoc", { bg = "NONE" })
      vim.api.nvim_set_hl(0, "BlinkCmpDocBorder", { bg = "NONE" })
    end,
  },
}
