local spaces = require("hs.spaces")
require("hs.ipc")

-- ============================================
-- SHARED HELPER FUNCTIONS
-- ============================================

local function getMainWindow(app)
  local win = nil
  while win == nil do
    win = app:mainWindow()
  end
  return win
end

local function moveWindowToSpace(app, window, space, mainScreen)
  if window:isFullScreen() then
    hs.eventtap.keyStroke('fn', 'f', 0, app)
  end

  local winFrame = window:frame()
  local scrFrame = mainScreen:fullFrame()
  winFrame.w = scrFrame.w
  winFrame.y = scrFrame.y
  winFrame.x = scrFrame.x
  window:setFrame(winFrame, 0)
  spaces.moveWindowToSpace(window, space)

  if window:isFullScreen() then
    hs.eventtap.keyStroke('fn', 'f', 0, app)
  end
  window:focus()
end

-- ============================================
-- GENERIC DROPDOWN TERMINAL HANDLER
-- ============================================

local function createDropdownHandler(bundleId, windowGeometry)
  windowGeometry = windowGeometry or { x = 0, y = 0, w = 1, h = 0.55 }

  return function()
    local app = hs.application.get(bundleId)
    local space = spaces.activeSpaceOnScreen()
    local mainScreen = hs.screen.mainScreen()

    if app ~= nil and app:isFrontmost() then
      app:hide()
    else
      if app == nil then
        hs.application.launchOrFocusByBundleID(bundleId)

        local appWatcher = nil
        appWatcher = hs.application.watcher.new(function(name, event, launchedApp)
          if event == hs.application.watcher.launched and launchedApp:bundleID() == bundleId then
            local win = getMainWindow(launchedApp)
            win:move(hs.geometry(windowGeometry))
            launchedApp:hide()
            moveWindowToSpace(launchedApp, win, space, mainScreen)
            appWatcher:stop()
          end
        end)
        appWatcher:start()
      else
        local win = getMainWindow(app)
        moveWindowToSpace(app, win, space, mainScreen)
      end
    end
  end
end

-- ============================================
-- WEZTERM VISOR HANDLER (with state tracking)
-- ============================================

if not _G.dropdownWezWindow then
  _G.dropdownWezWindow = nil
end

local function weztermVisorHandler()
  local BUNDLE_ID = 'com.github.wez.wezterm.visor'

  local function getWindowById(windowId)
    if windowId then
      return hs.window.get(windowId)
    end
    return nil
  end

  local wezApp = hs.application.get(BUNDLE_ID)
  local dropdownWin = nil

  if _G.dropdownWezWindow then
    dropdownWin = getWindowById(_G.dropdownWezWindow)
    if not dropdownWin then
      _G.dropdownWezWindow = nil
    end
  end

  local focusedWin = hs.window.focusedWindow()
  local isDropdownFocused = dropdownWin and focusedWin and dropdownWin:id() == focusedWin:id()

  if isDropdownFocused and wezApp then
    wezApp:hide()
  else
    local space = spaces.activeSpaceOnScreen()
    local mainScreen = hs.screen.mainScreen()

    if dropdownWin then
      if wezApp then
        wezApp:unhide()
        dropdownWin:focus()
        moveWindowToSpace(wezApp, dropdownWin, space, mainScreen)
      end
    else
      if wezApp == nil then
        hs.execute("open -b " .. BUNDLE_ID .. " --args --config-file ~/.config/wezterm/wezterm-visor.lua")

        local appWatcher = nil
        appWatcher = hs.application.watcher.new(function(name, event, app)
          if event == hs.application.watcher.launched and app:bundleID() == BUNDLE_ID then
            hs.timer.doAfter(0.5, function()
              local newWindow = app:mainWindow()
              if newWindow then
                _G.dropdownWezWindow = newWindow:id()
                newWindow:move(hs.geometry({ x = 4, y = 0, w = 1, h = 0.55 }))
                moveWindowToSpace(app, newWindow, space, mainScreen)
              end
            end)
            appWatcher:stop()
          end
        end)
        appWatcher:start()
      else
        local allWindows = wezApp:allWindows()
        if #allWindows > 0 then
          local existingWin = allWindows[1]
          _G.dropdownWezWindow = existingWin:id()
          wezApp:unhide()
          existingWin:focus()
          moveWindowToSpace(wezApp, existingWin, space, mainScreen)
        else
          local menuItemResult = wezApp:selectMenuItem({ "Shell", "New Window" })
          if not menuItemResult then
            wezApp:activate()
          end

          hs.timer.doAfter(0.5, function()
            local newWindows = wezApp:allWindows()
            if #newWindows > 0 then
              local newWindow = newWindows[1]
              _G.dropdownWezWindow = newWindow:id()
              moveWindowToSpace(wezApp, newWindow, space, mainScreen)
            end
          end)
        end
      end
    end
  end
end

-- ============================================
-- ERROR HANDLING WRAPPER
-- ============================================

local function safeCall(func, errorMsg)
  return function(...)
    local success, err = pcall(func, ...)
    if not success then
      hs.notify.new({ title = "Hammerspoon Error", informativeText = errorMsg .. ": " .. tostring(err) }):send()
    end
  end
end

-- ============================================
-- KEYBINDINGS
-- ============================================

-- WezTerm Visor (preferred)
hs.hotkey.bind({ 'command' }, '§', safeCall(weztermVisorHandler, "WezTerm visor toggle failed"))
hs.hotkey.bind({ 'command' }, '`', safeCall(weztermVisorHandler, "WezTerm visor toggle failed"))

-- Alternative: Regular Kitty dropdown (if you use it)
-- local kittyDropdown = createDropdownHandler('net.kovidgoyal.kitty')
-- hs.hotkey.bind({'command'}, 'escape', safeCall(kittyDropdown, "Kitty dropdown failed"))
