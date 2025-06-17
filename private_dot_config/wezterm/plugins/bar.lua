local wezterm = require("wezterm")
local bar = wezterm.plugin.require("https://github.com/adriankarlen/bar.wezterm")

local M = {}

function M.setup(config)
	bar.apply_to_config(config)
end

return M