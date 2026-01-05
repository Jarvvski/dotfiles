#!/bin/bash
# macOS System Defaults
# Run with: ./macos_defaults.sh

echo "Setting macOS defaults..."

# Finder
echo "→ Configuring Finder..."
defaults write com.apple.finder ShowPathbar -bool true
defaults write com.apple.finder ShowStatusBar -bool true
defaults write com.apple.finder AppleShowAllFiles -bool true
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"  # List view

# Dock
echo "→ Configuring Dock..."
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock tilesize -int 48
defaults write com.apple.dock orientation -string "bottom"

# Screenshots
echo "→ Configuring Screenshots..."
defaults write com.apple.screencapture location -string "${HOME}/Pictures/Screenshots"
defaults write com.apple.screencapture type -string "png"
defaults write com.apple.screencapture disable-shadow -bool true
mkdir -p "${HOME}/Pictures/Screenshots"

# Keyboard
echo "→ Configuring Keyboard..."
defaults write NSGlobalDomain KeyRepeat -int 2
defaults write NSGlobalDomain InitialKeyRepeat -int 15
defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false

# Trackpad
echo "→ Configuring Trackpad..."
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1

# Mission Control
echo "→ Configuring Mission Control..."
defaults write com.apple.dock mru-spaces -bool false

# Menu bar
echo "→ Configuring Menu Bar..."
defaults write NSGlobalDomain AppleShowScrollBars -string "Automatic"
defaults write com.apple.menuextra.clock DateFormat -string "EEE d MMM HH:mm"

# Safari
echo "→ Configuring Safari..."
defaults write com.apple.Safari ShowFullURLInSmartSearchField -bool true
defaults write com.apple.Safari IncludeDevelopMenu -bool true
defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true

# Terminal
echo "→ Configuring Terminal..."
defaults write com.apple.terminal StringEncodings -array 4

# Time Machine
echo "→ Configuring Time Machine..."
defaults write com.apple.TimeMachine DoNotOfferNewDisksForBackup -bool true

# Activity Monitor
echo "→ Configuring Activity Monitor..."
defaults write com.apple.ActivityMonitor ShowCategory -int 0
defaults write com.apple.ActivityMonitor IconType -int 5

echo "✓ Done! Please restart for some changes to take effect."
echo "  killall Finder Dock SystemUIServer"
