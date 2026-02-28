#!/bin/bash
# LunaIDE Fast Fork — Prepare + Build
# Downloads the latest pre-built VSCodium for macOS ARM64 and patches it into LunaIDE.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$HOME/LunaIDE-dist"

echo "=== LunaIDE Fast Build ==="

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# Step 1: Get the latest VSCodium download URL for darwin-arm64
echo "Fetching latest VSCodium release..."
LATEST_ASSET_URL=$(curl -s "https://api.github.com/repos/VSCodium/vscodium/releases/latest" | grep "browser_download_url.*darwin-arm64.*\.zip" | cut -d '"' -f 4 | head -n 1)

if [ -z "$LATEST_ASSET_URL" ]; then
    echo "Failed to find VSCodium download URL."
    exit 1
fi

ZIP_FILE="vscodium.zip"
echo "Downloading $LATEST_ASSET_URL..."
curl -L -o "$ZIP_FILE" "$LATEST_ASSET_URL"

# Step 2: Extract the App
echo "Extracting..."
rm -rf "VSCodium.app" "LunaIDE.app"
unzip -q "$ZIP_FILE"
rm "$ZIP_FILE"

# Step 3: Rename to LunaIDE
mv "VSCodium.app" "LunaIDE.app"
APP_DIR="$OUT_DIR/LunaIDE.app"

# Step 4: Patch Info.plist
echo "Patching Info.plist..."
PLIST="$APP_DIR/Contents/Info.plist"

# We use sed to replace VSCodium with LunaIDE in key places
sed -i.bak 's/<string>VSCodium<\/string>/<string>LunaIDE<\/string>/g' "$PLIST"
sed -i.bak 's/<string>com.vscodium<\/string>/<string>com.lunaide.app<\/string>/g' "$PLIST"
sed -i.bak 's/<string>vscodium<\/string>/<string>lunaide<\/string>/g' "$PLIST"
rm -f "$PLIST.bak"

# Step 4.5: Generate and inject LunaIDE app icon
echo "Generating app icon..."
ICON_SVG="$ROOT_DIR/fork/assets/lunaide-icon.svg"
ICONSET_DIR="/tmp/LunaIDE.iconset"
ICNS_OUT="$APP_DIR/Contents/Resources/LunaIDE.icns"
mkdir -p "$ICONSET_DIR"
mkdir -p "$(dirname "$ICON_SVG")"

# Write the SVG icon
cat > "$ICON_SVG" << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="220" fill="#1a1a2e"/>
  <defs>
    <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#74C7EC"/>
      <stop offset="100%" stop-color="#B4A7D6"/>
    </linearGradient>
  </defs>
  <path d="M 600 200 A 300 300 0 1 0 800 750 A 350 350 0 1 1 600 200 Z" fill="url(#mg)"/>
</svg>
SVGEOF

# Render SVG → 1024px PNG via qlmanage, then sips-resize to all required sizes
QLOUT="/tmp/luna_ql_out"
rm -rf "$QLOUT" && mkdir -p "$QLOUT"
qlmanage -t -s 1024 -o "$QLOUT" "$ICON_SVG" > /dev/null 2>&1
SRC_PNG="$QLOUT/lunaide-icon.svg.png"

for SIZE in 16 32 64 128 256 512 1024; do
  sips -z $SIZE $SIZE "$SRC_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png" > /dev/null
done
for SIZE in 16 32 64 128 256 512; do
  DOUBLE=$((SIZE * 2))
  cp "$ICONSET_DIR/icon_${DOUBLE}x${DOUBLE}.png" "$ICONSET_DIR/icon_${SIZE}x${SIZE}@2x.png"
done

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_OUT"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile LunaIDE.icns" "$PLIST"
rm -rf "$ICONSET_DIR" "$QLOUT"
echo "App icon injected."

# Step 5: Patch product.json completely to ensure no keychain clashes
echo "Patching product.json..."
PRODUCT_JSON="$APP_DIR/Contents/Resources/app/product.json"
sed -i.bak 's/VSCodium/LunaIDE/g' "$PRODUCT_JSON"
sed -i.bak 's/vscodium/lunaide/g' "$PRODUCT_JSON"
sed -i.bak 's/codium/lunaide/g' "$PRODUCT_JSON"
sed -i.bak 's/\.vscode-oss/\.lunaide/g' "$PRODUCT_JSON"

# Link the default settings in product.json
# We add "settings": { "default": { "workbench.startupEditor": "none" } } essentially by pointing it to the file
sed -i.bak 's/"nameShort": "LunaIDE",/"nameShort": "LunaIDE",\n  "settings": {"default": {"workbench.startupEditor": "none"}},/g' "$PRODUCT_JSON"
rm -f "$PRODUCT_JSON.bak"

# Step 5.5: Patch the Electron executable for the Safe Storage keychain string
echo "Patching Electron executable keychain strings..."
EXEC_FILE="$APP_DIR/Contents/MacOS/Electron"
# We pad "LunaIDE  Safe Storage" to match the exact byte length of "VSCodium Safe Storage"
LC_ALL=C sed -i.bak 's/VSCodium Safe Storage/LunaIDE  Safe Storage/g' "$EXEC_FILE"
rm -f "$EXEC_FILE.bak"

# Step 6: Build and Inject our Extensions
echo "Building extensions..."
cd "$ROOT_DIR"
pnpm build

# Download luau-lsp binary for macOS (bundled into extension)
echo "Downloading luau-lsp..."
LUAU_LSP_ASSET_URL=$(curl -s "https://api.github.com/repos/JohnnyMorganz/luau-lsp/releases/latest" | grep "browser_download_url.*macos\.zip" | cut -d '"' -f 4 | head -n 1)
if [ -n "$LUAU_LSP_ASSET_URL" ]; then
    mkdir -p "$ROOT_DIR/packages/core/assets/bin"
    TMP_ZIP=$(mktemp /tmp/luau-lsp-XXXXXX.zip)
    curl -L -o "$TMP_ZIP" "$LUAU_LSP_ASSET_URL"
    unzip -o -j "$TMP_ZIP" "luau-lsp" -d "$ROOT_DIR/packages/core/assets/bin"
    rm -f "$TMP_ZIP"
    chmod +x "$ROOT_DIR/packages/core/assets/bin/luau-lsp"
    echo "luau-lsp downloaded."
else
    echo "Warning: Could not find luau-lsp macOS release. LSP will require manual installation."
fi

echo "Injecting extensions..."
# VS Code requires built-in extensions to be named exactly: publisher.name-version
EXT_DIR="$APP_DIR/Contents/Resources/app/extensions"
CORE_EXT_DIR="$EXT_DIR/roblox-ide.roblox-ide-core-0.1.0"
MCP_EXT_DIR="$EXT_DIR/roblox-ide.roblox-ide-mcp-0.1.0"

mkdir -p "$CORE_EXT_DIR"
mkdir -p "$MCP_EXT_DIR"

cp -r "$ROOT_DIR/packages/core/dist" "$CORE_EXT_DIR/"
cp "$ROOT_DIR/packages/core/package.json" "$CORE_EXT_DIR/"
cp -r "$ROOT_DIR/packages/core/assets" "$CORE_EXT_DIR/"

cp -r "$ROOT_DIR/packages/mcp-server/dist" "$MCP_EXT_DIR/"
cp "$ROOT_DIR/packages/mcp-server/package.json" "$MCP_EXT_DIR/"

# Step 6.5: Inject Default Settings to disable VSCodium Welcome Page
echo "Injecting default settings..."
mkdir -p "$APP_DIR/Contents/Resources/app/product"
cat << 'EOF' > "$APP_DIR/Contents/Resources/app/product/defaultSettings.json"
{
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "update.mode": "none",
  "workbench.accounts.visibility": "hidden",
  "files.exclude": {
    "**/.lunaide/.port": true
  }
}
EOF

# Step 6.6: Replace editor watermark (letterpress) with LunaIDE crescent moon
echo "Replacing editor watermark..."
MEDIA_DIR="$APP_DIR/Contents/Resources/app/out/media"
MOON_PATH='M 60 20 A 30 30 0 1 0 80 75 A 35 35 0 1 1 60 20 Z'
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#B2B2B2\" fill-opacity=\".3\"/></svg>" > "$MEDIA_DIR/letterpress-dark.svg"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#B2B2B2\" fill-opacity=\".1\"/></svg>" > "$MEDIA_DIR/letterpress-light.svg"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#ffffff\" fill-opacity=\".6\"/></svg>" > "$MEDIA_DIR/letterpress-hcDark.svg"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#000000\" fill-opacity=\".15\"/></svg>" > "$MEDIA_DIR/letterpress-hcLight.svg"

# Step 7: Rename macOS Helper Apps to match CFBundleName
echo "Renaming Helper Apps..."
for suffix in "" " (GPU)" " (Plugin)" " (Renderer)"; do
    helper="VSCodium Helper$suffix"
    new_helper="LunaIDE Helper$suffix"
    
    if [ -d "$APP_DIR/Contents/Frameworks/$helper.app" ]; then
        mv "$APP_DIR/Contents/Frameworks/$helper.app" "$APP_DIR/Contents/Frameworks/$new_helper.app"
        mv "$APP_DIR/Contents/Frameworks/$new_helper.app/Contents/MacOS/$helper" "$APP_DIR/Contents/Frameworks/$new_helper.app/Contents/MacOS/$new_helper"
        sed -i.bak "s/$helper/$new_helper/g" "$APP_DIR/Contents/Frameworks/$new_helper.app/Contents/Info.plist"
        rm -f "$APP_DIR/Contents/Frameworks/$new_helper.app/Contents/Info.plist.bak"
    fi
done

echo "=== Done! ==="
echo "Your app is ready at: $APP_DIR"

# Step 8: Fix macOS Quarantine & Codesigning
echo "Fixing macOS app signatures..."
xattr -cr "$APP_DIR"
codesign --force --deep --sign - "$APP_DIR"
