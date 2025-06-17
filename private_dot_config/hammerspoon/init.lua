local spaces = require("hs.spaces") -- https://github.com/asmagill/hs._asm.spaces

local function dropdown() -- change your own hotkey combo here, available keys could be found here:https://www.hammerspoon.org/docs/hs.hotkey.html#bind
  local BUNDLE_ID = 'net.kovidgoyal.kitty' -- more accurate to avoid mismatching on browser titles

  function getMainWindow(app)
    -- get main window from app
    local win = nil
    while win == nil do
      win = app:mainWindow()
    end
    return win
  end

  function moveWindow(kitty, space, mainScreen)
    -- move to main space
    local win = getMainWindow(kitty)
    if win:isFullScreen() then
      hs.eventtap.keyStroke('fn', 'f', 0, kitty)
    end
    winFrame = win:frame()
    scrFrame = mainScreen:fullFrame()
    winFrame.w = scrFrame.w
    winFrame.y = scrFrame.y
    winFrame.x = scrFrame.x
    win:setFrame(winFrame, 0)
    spaces.moveWindowToSpace(win, space)
    if win:isFullScreen() then
      hs.eventtap.keyStroke('fn', 'f', 0, kitty)
    end
    win:focus()
  end

  local kitty = hs.application.get(BUNDLE_ID)
  if kitty ~= nil and kitty:isFrontmost() then
    kitty:hide()
  else
    local space = spaces.activeSpaceOnScreen()
    local mainScreen = hs.screen.mainScreen()
    if kitty == nil and hs.application.launchOrFocusByBundleID(BUNDLE_ID) then
      local appWatcher = nil
      appWatcher = hs.application.watcher.new(function(name, event, app)
        if event == hs.application.watcher.launched and app:bundleID() == BUNDLE_ID then
          getMainWindow(app):move(hs.geometry({x=0,y=0,w=1,h=0.55})) -- move kitty window on top, you could set the window percentage here
          app:hide()
          moveWindow(app, space, mainScreen)
          appWatcher:stop()
        end
      end)
      appWatcher:start()
    end
    if kitty ~= nil then
      moveWindow(kitty, space, mainScreen)
    end
  end
end

local function wez() -- change your own hotkey combo here, available keys could be found here:https://www.hammerspoon.org/docs/hs.hotkey.html#bind
  local BUNDLE_ID = 'com.github.wez.wezterm' -- more accurate to avoid mismatching on browser titles

  function getMainWindow(app)
    -- get main window from app
    local win = nil
    while win == nil do
      win = app:mainWindow()
    end
    return win
  end

  function moveWindow(kitty, space, mainScreen)
    -- move to main space
    local win = getMainWindow(kitty)
    if win:isFullScreen() then
      hs.eventtap.keyStroke('fn', 'f', 0, kitty)
    end
    winFrame = win:frame()
    scrFrame = mainScreen:fullFrame()
    winFrame.w = scrFrame.w
    winFrame.y = scrFrame.y
    winFrame.x = scrFrame.x
    win:setFrame(winFrame, 0)
    spaces.moveWindowToSpace(win, space)
    if win:isFullScreen() then
      hs.eventtap.keyStroke('fn', 'f', 0, kitty)
    end
    win:focus()
  end

  local kitty = hs.application.get(BUNDLE_ID)
  if kitty ~= nil and kitty:isFrontmost() then
    kitty:hide()
  else
    local space = spaces.activeSpaceOnScreen()
    local mainScreen = hs.screen.mainScreen()
    if kitty == nil and hs.application.launchOrFocusByBundleID(BUNDLE_ID) then
      local appWatcher = nil
      appWatcher = hs.application.watcher.new(function(name, event, app)
        if event == hs.application.watcher.launched and app:bundleID() == BUNDLE_ID then
          getMainWindow(app):move(hs.geometry({x=0,y=0,w=1,h=0.55})) -- move kitty window on top, you could set the window percentage here
          app:hide()
          moveWindow(app, space, mainScreen)
          appWatcher:stop()
        end
      end)
      appWatcher:start()
    end
    if kitty ~= nil then
      moveWindow(kitty, space, mainScreen)
    end
  end
end

local function newWez()
  local BUNDLE_ID = 'com.github.wez.wezterm'

  -- We'll use a global variable to track our specific dropdown window
  if not _G.dropdownWezWindow then
    _G.dropdownWezWindow = nil
  end

  local function getWindowById(windowId)
    -- Get window by its ID if we have it stored
    if windowId then
      return hs.window.get(windowId)
    end
    return nil
  end

  local function moveWindow(app, window, space, mainScreen)
    -- move to main space
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

  -- Get the WezTerm application instance
  local wezApp = hs.application.get(BUNDLE_ID)

  -- Get our tracked dropdown window if it exists
  local dropdownWin = getWindowById(_G.dropdownWezWindow)

  -- Validate the window still exists and is valid
  if dropdownWin == nil or not dropdownWin:isValid() then
    _G.dropdownWezWindow = nil
    dropdownWin = nil
  end

  -- If our dropdown window exists and is frontmost, hide just that window
  if dropdownWin and dropdownWin:isVisible() and wezApp and wezApp:isFrontmost() then
    -- Use application:hide() instead of window:hide() which might not be available
    -- or store the window in a variable and hide it via the app
    wezApp:hide()
  else
    local space = spaces.activeSpaceOnScreen()
    local mainScreen = hs.screen.mainScreen()

    -- If we have a stored dropdown window that's valid
    if dropdownWin then
      -- Ensure the application is running
      if wezApp then
        wezApp:unhide()
        dropdownWin:focus()
        moveWindow(wezApp, dropdownWin, space, mainScreen)
      end
    else
      -- If no dropdown window exists or it's invalid, create a new one
      if wezApp == nil then
        -- Launch WezTerm if it's not running
        hs.application.launchOrFocusByBundleID(BUNDLE_ID)

        local appWatcher = nil
        appWatcher = hs.application.watcher.new(function(name, event, app)
          if event == hs.application.watcher.launched and app:bundleID() == BUNDLE_ID then
            -- Wait a bit for windows to be created
            hs.timer.doAfter(0.5, function()
              -- Get the newly created main window
              local newWindow = app:mainWindow()
              if newWindow then
                -- Store this new window's ID as our dropdown window
                _G.dropdownWezWindow = newWindow:id()

                -- Position it at the top of the screen
                newWindow:move(hs.geometry({x=0, y=0, w=1, h=0.4}))
                moveWindow(app, newWindow, space, mainScreen)
              end
            end)
            appWatcher:stop()
          end
        end)
        appWatcher:start()
      else
        -- WezTerm is running but we don't have a tracked window
        -- Get all windows of the application
        local allWindows = wezApp:allWindows()

        if #allWindows > 0 then
          -- Use the first available window
          local existingWin = allWindows[1]

          -- Store this window as our dropdown window
          _G.dropdownWezWindow = existingWin:id()

          -- Show the application and focus the window
          wezApp:unhide()
          existingWin:focus()
          moveWindow(wezApp, existingWin, space, mainScreen)
        else
          -- No existing windows, so create a new one
          -- Try to create a new window via the menu
          local menuItemResult = wezApp:selectMenuItem({"Shell", "New Window"})

          if not menuItemResult then
            -- Alternative approach: activate the app which often creates a window
            wezApp:activate()
          end

          -- Wait briefly for the window to be created
          hs.timer.doAfter(0.5, function()
            local newWindows = wezApp:allWindows()
            if #newWindows > 0 then
              local newWindow = newWindows[1]
              _G.dropdownWezWindow = newWindow:id()
              moveWindow(wezApp, newWindow, space, mainScreen)
            end
          end)
        end
      end
    end
  end
end

local function newWez()
  local BUNDLE_ID = 'com.github.wez.wezterm'

  -- We'll use a global variable to track our specific dropdown window
  if not _G.dropdownWezWindow then
    _G.dropdownWezWindow = nil
  end

  local function getWindowById(windowId)
    -- Get window by its ID if we have it stored
    if windowId then
      return hs.window.get(windowId)
    end
    return nil
  end

  local function moveWindow(app, window, space, mainScreen)
    -- move to main space
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

  -- Get the WezTerm application instance
  local wezApp = hs.application.get(BUNDLE_ID)

  -- Get our tracked dropdown window if it exists
  local dropdownWin = nil
  if _G.dropdownWezWindow then
    dropdownWin = getWindowById(_G.dropdownWezWindow)

    -- Check if the window reference is still valid
    if not dropdownWin then
      _G.dropdownWezWindow = nil
    end
  end

  -- If our dropdown window exists and is frontmost, hide just that window
  if dropdownWin and wezApp and wezApp:isFrontmost() then
    wezApp:hide()
  else
    local space = spaces.activeSpaceOnScreen()
    local mainScreen = hs.screen.mainScreen()

    -- If we have a stored dropdown window that's valid
    if dropdownWin then
      -- Ensure the application is running
      if wezApp then
        wezApp:unhide()
        dropdownWin:focus()
        moveWindow(wezApp, dropdownWin, space, mainScreen)
      end
    else
      -- If no dropdown window exists or it's invalid, create a new one
      if wezApp == nil then
        -- Launch WezTerm if it's not running
        hs.application.launchOrFocusByBundleID(BUNDLE_ID)

        local appWatcher = nil
        appWatcher = hs.application.watcher.new(function(name, event, app)
          if event == hs.application.watcher.launched and app:bundleID() == BUNDLE_ID then
            -- Wait a bit for windows to be created
            hs.timer.doAfter(0.5, function()
              -- Get the newly created main window
              local newWindow = app:mainWindow()
              if newWindow then
                -- Store this new window's ID as our dropdown window
                _G.dropdownWezWindow = newWindow:id()

                -- Position it at the top of the screen
                newWindow:move(hs.geometry({x=0, y=0, w=1, h=0.4}))
                moveWindow(app, newWindow, space, mainScreen)
              end
            end)
            appWatcher:stop()
          end
        end)
        appWatcher:start()
      else
        -- WezTerm is running but we don't have a tracked window
        -- Get all windows of the application
        local allWindows = wezApp:allWindows()

        if #allWindows > 0 then
          -- Use the first available window
          local existingWin = allWindows[1]

          -- Store this window as our dropdown window
          _G.dropdownWezWindow = existingWin:id()

          -- Show the application and focus the window
          wezApp:unhide()
          existingWin:focus()
          moveWindow(wezApp, existingWin, space, mainScreen)
        else
          -- No existing windows, so create a new one
          -- Try to create a new window via the menu
          local menuItemResult = wezApp:selectMenuItem({"Shell", "New Window"})

          if not menuItemResult then
            -- Alternative approach: activate the app which often creates a window
            wezApp:activate()
          end

          -- Wait briefly for the window to be created
          hs.timer.doAfter(0.5, function()
            local newWindows = wezApp:allWindows()
            if #newWindows > 0 then
              local newWindow = newWindows[1]
              _G.dropdownWezWindow = newWindow:id()
              moveWindow(wezApp, newWindow, space, mainScreen)
            end
          end)
        end
      end
    end
  end
end

-- Switch kitty
-- hs.hotkey.bind({'command'}, 'escape', wez)
hs.hotkey.bind({'command'}, '§', wez)
hs.hotkey.bind({'command'}, '`', wez)
-- hs.hotkey.bind({'command'}, '\'', wez)
