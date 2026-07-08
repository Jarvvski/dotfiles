return {
  -- LSP Configuration
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
      "saghen/blink.cmp",
      { "folke/lazydev.nvim", ft = "lua", opts = {} },
    },
    config = function()

      -- Setup Mason
      require("mason").setup()

      local servers = {
        "lua_ls",
        "ts_ls",  -- Updated from tsserver
        "rust_analyzer",
        "gopls",
        "pyright",
        "bashls",
        "jsonls",
        "yamlls",
        "terraformls",
        "kotlin_language_server",
      }

      require("mason-lspconfig").setup({
        ensure_installed = servers,
        automatic_installation = true,
      })

      -- LSP keymaps
      local on_attach = function(_, bufnr)
        local opts = { buffer = bufnr }
        vim.keymap.set("n", "gd", vim.lsp.buf.definition, vim.tbl_extend("force", opts, { desc = "Go to definition" }))
        vim.keymap.set("n", "gD", vim.lsp.buf.declaration, vim.tbl_extend("force", opts, { desc = "Go to declaration" }))
        vim.keymap.set("n", "gi", vim.lsp.buf.implementation, vim.tbl_extend("force", opts, { desc = "Go to implementation" }))
        vim.keymap.set("n", "gr", vim.lsp.buf.references, vim.tbl_extend("force", opts, { desc = "Go to references" }))
        vim.keymap.set("n", "K", vim.lsp.buf.hover, vim.tbl_extend("force", opts, { desc = "Hover documentation" }))
        vim.keymap.set("n", "<C-k>", vim.lsp.buf.signature_help, vim.tbl_extend("force", opts, { desc = "Signature help" }))
        vim.keymap.set("n", "<leader>lr", vim.lsp.buf.rename, vim.tbl_extend("force", opts, { desc = "Rename" }))
        vim.keymap.set("n", "<leader>la", vim.lsp.buf.code_action, vim.tbl_extend("force", opts, { desc = "Code action" }))
        vim.keymap.set("n", "<leader>lf", function() vim.lsp.buf.format({ async = true }) end, vim.tbl_extend("force", opts, { desc = "Format" }))
      end

      -- Capabilities (blink.cmp augments the LSP defaults for completion)
      local capabilities = require("blink.cmp").get_lsp_capabilities()

      -- Setup LSP servers using new vim.lsp.config API
      for _, server in ipairs(servers) do
        if server == "lua_ls" then
          vim.lsp.config(server, {
            cmd = { vim.fn.exepath("lua-language-server") },
            capabilities = capabilities,
            root_markers = { ".luarc.json", ".luarc.jsonc", ".luacheckrc", ".stylua.toml", "stylua.toml", "selene.toml", "selene.yml", ".git" },
            settings = {
              Lua = {
                diagnostics = {
                  globals = { "vim" },
                },
                workspace = {
                  library = vim.api.nvim_get_runtime_file("", true),
                  checkThirdParty = false,
                },
              },
            },
          })
        else
          vim.lsp.config(server, {
            capabilities = capabilities,
          })
        end
      end

      -- Auto-enable LSP servers
      vim.api.nvim_create_autocmd("FileType", {
        callback = function(args)
          for _, server in ipairs(servers) do
            vim.lsp.enable(server)
          end
        end,
      })

      -- Setup on_attach for all buffers
      vim.api.nvim_create_autocmd("LspAttach", {
        callback = function(args)
          on_attach(vim.lsp.get_client_by_id(args.data.client_id), args.buf)
        end,
      })
    end,
  },

  -- Mason (LSP installer)
  {
    "williamboman/mason.nvim",
    build = ":MasonUpdate",
  },
}
