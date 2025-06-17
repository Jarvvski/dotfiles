local fs = hs.fs
function hs.spoons.list(onlyLoaded)
	-- Patched version of original `hs.spoons.list`.
	-- Fixes/works around Hammerspoon/hammerspoon#2441
	-- Fixes/works around Hammerspoon/hammerspoon#2887

	-- One result array for all the Spoon directories...
	local res = {}
	-- For each module path spec...
	for entry in package.path:gmatch '[^;]*' do
		-- if it looks like it's for spoons...
		local dir = entry:match '^([^?]*)/%?%.spoon/init%.lua$'
		if dir then
			-- then scan it like the original function did
			local ok, _, dirobj = pcall(fs.dir, dir)
			if dirobj then
				repeat
					local f = dirobj:next()
					if f then
						if string.match(f, ".spoon$") then
							local s = f:gsub(".spoon$", "")
							local l = ((_G.spoon or {})[s] ~= nil)
							if (not onlyLoaded) or l then
								local new = { name = s, loaded = l }
								if l then new.version = _G.spoon[s].version end
								table.insert(res, new)
							end
						end
					end
				until f == nil
			end
		end
	end
	return res
end
