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

# Step 5: Patch product.json
echo "Patching product.json..."
PRODUCT_JSON="$APP_DIR/Contents/Resources/app/product.json"
sed -i.bak 's/"nameShort": "VSCodium"/"nameShort": "LunaIDE"/' "$PRODUCT_JSON"
sed -i.bak 's/"nameLong": "VSCodium"/"nameLong": "LunaIDE"/' "$PRODUCT_JSON"
sed -i.bak 's/"applicationName": "codium"/"applicationName": "lunaide"/' "$PRODUCT_JSON"
rm -f "$PRODUCT_JSON.bak"

# Step 6: Build and Inject our Extensions
echo "Building extensions..."
cd "$ROOT_DIR"
pnpm build

echo "Injecting extensions..."
EXT_DIR="$APP_DIR/Contents/Resources/app/extensions"
mkdir -p "$EXT_DIR/roblox-ide-core"
mkdir -p "$EXT_DIR/roblox-ide-mcp"

cp -r "$ROOT_DIR/packages/core/dist" "$EXT_DIR/roblox-ide-core/"
cp "$ROOT_DIR/packages/core/package.json" "$EXT_DIR/roblox-ide-core/"

cp -r "$ROOT_DIR/packages/mcp-server/dist" "$EXT_DIR/roblox-ide-mcp/"
cp "$ROOT_DIR/packages/mcp-server/package.json" "$EXT_DIR/roblox-ide-mcp/"

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
