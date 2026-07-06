#!/bin/bash

# Create KittyVisor app bundle (standalone visor with unique bundle ID)
# Same approach as WezTermVisor: copy the actual binary so macOS
# recognizes it as a separate app with its own bundle ID.

echo "Creating Visor app bundle..."
rm -rf ~/Applications/Visor.app
mkdir -p ~/Applications/Visor.app/Contents/{MacOS,Resources}

# Create Info.plist with unique bundle ID and LSUIElement (no Dock icon)
cat > ~/Applications/Visor.app/Contents/Info.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>net.kovidgoyal.kitty.visor</string>
    <key>CFBundleExecutable</key>
    <string>kitty</string>
    <key>CFBundleName</key>
    <string>Visor</string>
    <key>CFBundleDisplayName</key>
    <string>Visor</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleIconFile</key>
    <string>visor.icns</string>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
EOF

# Copy the actual kitty binary (not a wrapper script!)
echo "Copying kitty binary..."
cp /Applications/kitty.app/Contents/MacOS/kitty ~/Applications/Visor.app/Contents/MacOS/kitty

# Copy kitten binary (needed for remote control)
echo "Copying kitten binary..."
cp /Applications/kitty.app/Contents/MacOS/kitten ~/Applications/Visor.app/Contents/MacOS/kitten

# Symlink Frameworks (kitty links against @executable_path/../Frameworks/)
echo "Symlinking frameworks..."
ln -sf /Applications/kitty.app/Contents/Frameworks ~/Applications/Visor.app/Contents/Frameworks

# Symlink all Resources (Python, terminfo, cacert.pem, etc.)
echo "Symlinking resources..."
for item in /Applications/kitty.app/Contents/Resources/*; do
    name=$(basename "$item")
    # Copy icon as real file, symlink everything else
    if [ "$name" = "kitty.icns" ]; then
        # Use custom visor icon (falls back to default kitty icon)
        SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
        if [ -f "$SCRIPT_DIR/neue_outrun.icns" ]; then
            cp "$SCRIPT_DIR/neue_outrun.icns" ~/Applications/Visor.app/Contents/Resources/visor.icns
        else
            cp "$item" ~/Applications/Visor.app/Contents/Resources/visor.icns
        fi
    else
        ln -sf "$item" ~/Applications/Visor.app/Contents/Resources/"$name"
    fi
done

# Sign the app bundle
echo "Signing app bundle..."
codesign --force --deep -s - ~/Applications/Visor.app

# Set custom icons via NSWorkspace (bypasses macOS icon cache)
echo "Setting app icons..."
/usr/bin/osascript -e 'use framework "AppKit"' -e 'set theImage to current application'\''s NSImage'\''s alloc()'\''s initWithContentsOfFile:"'$HOME'/Applications/Visor.app/Contents/Resources/visor.icns"' -e 'current application'\''s NSWorkspace'\''s sharedWorkspace()'\''s setIcon:theImage forFile:"'$HOME'/Applications/Visor.app" options:0'
if [ -f "$SCRIPT_DIR/neue_azure.icns" ]; then
    cp "$SCRIPT_DIR/neue_azure.icns" /Applications/kitty.app/Contents/Resources/kitty.icns
    /usr/bin/osascript -e 'use framework "AppKit"' -e 'set theImage to current application'\''s NSImage'\''s alloc()'\''s initWithContentsOfFile:"/Applications/kitty.app/Contents/Resources/kitty.icns"' -e 'current application'\''s NSWorkspace'\''s sharedWorkspace()'\''s setIcon:theImage forFile:"/Applications/kitty.app" options:0'
fi

echo "Done! Visor.app created in ~/Applications/"
echo "Bundle ID: net.kovidgoyal.kitty.visor"
