return {
  {
    "folke/flash.nvim",
    event = "VeryLazy",
    opts = {
      -- Flash is always on during / search (dims text, shows labels)
      modes = {
        search = {
          enabled = true,
        },
        -- Enhanced f/F/t/T with multi-char + labels
        char = {
          enabled = true,
          keys = { "f", "F", "t", "T", ";", "," },
          jump_labels = true,
        },
      },
    },
    keys = {
      {
        "s",
        mode = { "n", "x", "o" },
        function()
          require("flash").jump()
        end,
        desc = "Flash jump",
      },
      {
        "S",
        mode = { "n", "x", "o" },
        function()
          require("flash").treesitter()
        end,
        desc = "Flash Treesitter",
      },
    },
  },
}
