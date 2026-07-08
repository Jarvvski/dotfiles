-- AI coding layer.
--   * coder/claudecode.nvim - primary integration. Runs Claude Code in an
--     embedded terminal AND stands up a WebSocket MCP server so your Claude Code
--     sees real IDE context (open buffers, visual selection, diagnostics) and
--     proposes edits as in-editor diffs you accept/reject. Needs the `claude`
--     CLI on PATH (installed to ~/.local/bin during the T1 migration).
--   * folke/sidekick.nvim - Copilot-LSP "Next Edit Suggestions": multi-line edit
--     hints applied with <Tab>. NES requires `copilot-language-server` plus a
--     Copilot subscription; until then nes_jump_or_apply() returns false and
--     <Tab> falls through to its normal behavior, so this stays dormant.
return {
  {
    "coder/claudecode.nvim",
    dependencies = { "folke/snacks.nvim" },
    opts = {},
    keys = {
      { "<leader>a", nil, desc = "AI / Claude Code" },
      { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude Code" },
      { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude Code" },
      { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add current buffer" },
      { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send selection" },
      { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
      { "<leader>ar", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Reject diff" },
    },
  },
  {
    "folke/sidekick.nvim",
    opts = {
      nes = { enabled = true },
    },
    keys = {
      {
        "<tab>",
        function()
          -- Apply/jump to the next edit suggestion; fall through if none.
          if not require("sidekick").nes_jump_or_apply() then
            return "<tab>"
          end
        end,
        expr = true,
        desc = "Sidekick NES jump/apply",
      },
    },
  },
}
