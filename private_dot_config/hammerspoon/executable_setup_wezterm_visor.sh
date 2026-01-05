#!/bin/bash

# Create WezTermVisor app bundle
echo "Creating WezTermVisor app bundle..."
mkdir -p ~/Applications/WezTermVisor.app/Contents/{MacOS,Resources}

# Create Info.plist with unique bundle ID
cat > ~/Applications/WezTermVisor.app/Contents/Info.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.github.wez.wezterm.visor</string>
    <key>CFBundleExecutable</key>
    <string>wezterm-gui</string>
    <key>CFBundleName</key>
    <string>WezTermVisor</string>
    <key>CFBundleDisplayName</key>
    <string>WezTerm Visor</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
</dict>
</plist>
EOF

# Copy WezTerm executable
echo "Copying WezTerm executable..."
cp /Applications/WezTerm.app/Contents/MacOS/wezterm-gui ~/Applications/WezTermVisor.app/Contents/MacOS/wezterm-gui

# Copy icon (optional)
if [ -f /Applications/WezTerm.app/Contents/Resources/terminal.icns ]; then
    echo "Copying icon..."
    cp /Applications/WezTerm.app/Contents/Resources/terminal.icns ~/Applications/WezTermVisor.app/Contents/Resources/
fi

# Sign the app bundle
echo "Signing app bundle..."
codesign --force --deep -s - ~/Applications/WezTermVisor.app

echo "Done! WezTermVisor.app created in ~/Applications/"
echo "Bundle ID: com.github.wez.wezterm.visor"
