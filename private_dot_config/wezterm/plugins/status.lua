local wezterm = require 'wezterm'
local status = wezterm.plugin.require('https://github.com/yriveiro/wezterm-status')

local M = {}

function M.setup(config)
    status.apply_to_config(config, {
    cells = {
      battery = { enabled = false },
      date = { format = '%H:%M' }
    }
  })
end

return M