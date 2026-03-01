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

# Build Lua 5.1 from source and bundle into extension
echo "Building Lua 5.1..."
LUA_BIN_OUT="$ROOT_DIR/packages/core/assets/bin/lua"
if [ ! -f "$LUA_BIN_OUT" ]; then
    LUA_TMP=$(mktemp -d /tmp/lua-build-XXXXXX)
    curl -sL "https://www.lua.org/ftp/lua-5.1.5.tar.gz" | tar xz -C "$LUA_TMP"
    make -C "$LUA_TMP/lua-5.1.5" macosx -j"$(sysctl -n hw.logicalcpu)" 2>/dev/null
    cp "$LUA_TMP/lua-5.1.5/src/lua" "$LUA_BIN_OUT"
    chmod +x "$LUA_BIN_OUT"
    rm -rf "$LUA_TMP"
    echo "Lua 5.1 built and bundled."
else
    echo "Lua 5.1 already bundled, skipping build."
fi

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

# Install JohnnyMorganz luau-lsp into the user extensions dir (~/.lunaide/extensions/)
# so it appears in the Extensions tab and can be updated from there.
echo "Installing luau-lsp extension..."
LUAU_EXT_VERSION=$(curl -s "https://open-vsx.org/api/JohnnyMorganz/luau-lsp" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$LUAU_EXT_VERSION" ]; then
    USER_EXT_DIR="$HOME/.lunaide/extensions"
    LUAU_EXT_DEST="$USER_EXT_DIR/JohnnyMorganz.luau-lsp-${LUAU_EXT_VERSION}"
    if [ ! -d "$LUAU_EXT_DEST" ]; then
        LUAU_EXT_URL="https://open-vsx.org/api/JohnnyMorganz/luau-lsp/darwin-arm64/${LUAU_EXT_VERSION}/file/JohnnyMorganz.luau-lsp-${LUAU_EXT_VERSION}@darwin-arm64.vsix"
        LUAU_EXT_TMP=$(mktemp /tmp/luau-lsp-ext-XXXXXX.vsix)
        LUAU_EXT_UNZIP=$(mktemp -d /tmp/luau-lsp-ext-XXXXXX)
        curl -sL "$LUAU_EXT_URL" -o "$LUAU_EXT_TMP"
        unzip -o -q "$LUAU_EXT_TMP" "extension/*" -d "$LUAU_EXT_UNZIP"
        mkdir -p "$LUAU_EXT_DEST"
        cp -r "$LUAU_EXT_UNZIP/extension/." "$LUAU_EXT_DEST/"
        rm -f "$LUAU_EXT_TMP" && rm -rf "$LUAU_EXT_UNZIP"
        echo "luau-lsp extension installed to user extensions: ${LUAU_EXT_VERSION}"
    else
        echo "luau-lsp extension already installed: ${LUAU_EXT_VERSION}"
    fi
    # Remove any old version from app/extensions to avoid duplicate built-in copies
    rm -rf "$APP_DIR/Contents/Resources/app/extensions"/JohnnyMorganz.luau-lsp-*
else
    echo "Warning: Could not fetch luau-lsp extension version from Open VSX."
fi

# VS Code requires built-in extensions to be named exactly: publisher.name-version
EXT_DIR="$APP_DIR/Contents/Resources/app/extensions"
CORE_EXT_DIR="$EXT_DIR/roblox-ide.roblox-ide-core-0.1.0"
MCP_EXT_DIR="$EXT_DIR/roblox-ide.roblox-ide-mcp-0.1.0"

mkdir -p "$CORE_EXT_DIR"
mkdir -p "$MCP_EXT_DIR"

cp -r "$ROOT_DIR/packages/core/dist" "$CORE_EXT_DIR/"
cp "$ROOT_DIR/packages/core/package.json" "$CORE_EXT_DIR/"
cp -r "$ROOT_DIR/packages/core/assets" "$CORE_EXT_DIR/"
cp "$ROOT_DIR/packages/core/language-configuration.json" "$CORE_EXT_DIR/"

# Download Roblox global type definitions for Luau LSP
echo "Downloading Roblox globalTypes.d.luau..."
curl -sL "https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/main/scripts/globalTypes.d.luau" \
  -o "$CORE_EXT_DIR/assets/globalTypes.d.luau" \
  && echo "globalTypes.d.luau downloaded." \
  || echo "Warning: Could not download globalTypes.d.luau. Extended Roblox types will not be available."

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
    "**/.lunaide/.port": true,
    "**/sourcemap.json": true,
    "**/.git": true
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

# Step 9: Build and install the Studio plugin
echo "Building Studio plugin..."
PLUGIN_DIR="$ROOT_DIR/packages/studio-plugin"
ROBLOX_PLUGINS_DIR="$HOME/Documents/Roblox/Plugins"
PLUGIN_OUT="$ROBLOX_PLUGINS_DIR/LunaIDE.rbxmx"

# Find rojo binary (mirror rojoManager search order)
ROJO_BIN=""
AFTMAN_STORE="$HOME/.aftman/tool-storage/rojo-rbx/rojo"
if [ -d "$AFTMAN_STORE" ]; then
    LATEST_VER=$(ls "$AFTMAN_STORE" | sort -V | tail -n 1)
    if [ -n "$LATEST_VER" ] && [ -x "$AFTMAN_STORE/$LATEST_VER/rojo" ]; then
        ROJO_BIN="$AFTMAN_STORE/$LATEST_VER/rojo"
    fi
fi
if [ -z "$ROJO_BIN" ] && [ -x "$HOME/.foreman/bin/rojo" ]; then
    ROJO_BIN="$HOME/.foreman/bin/rojo"
fi
if [ -z "$ROJO_BIN" ] && [ -x "$HOME/.cargo/bin/rojo" ]; then
    ROJO_BIN="$HOME/.cargo/bin/rojo"
fi
if [ -z "$ROJO_BIN" ]; then
    ROJO_BIN=$(which rojo 2>/dev/null || true)
fi

if [ -z "$ROJO_BIN" ]; then
    echo "Warning: rojo not found — skipping Studio plugin build."
else
    mkdir -p "$ROBLOX_PLUGINS_DIR"
    "$ROJO_BIN" build "$PLUGIN_DIR/default.project.json" --output "$PLUGIN_OUT"
    echo "Studio plugin installed to: $PLUGIN_OUT"
    # Bundle the pre-built plugin into the app extension so _installPlugin() can copy it without rojo
    cp "$PLUGIN_OUT" "$CORE_EXT_DIR/LunaIDE.rbxmx"
    echo "Studio plugin bundled into app at: $CORE_EXT_DIR/LunaIDE.rbxmx"
fi

# Step 10: Install 'lunaide' shell command
echo "Installing 'lunaide' shell command..."
LUNA_BIN="$APP_DIR/Contents/Resources/app/bin/codium"
if [ -f "$LUNA_BIN" ]; then
    # Try /usr/local/bin first, fall back to ~/.local/bin
    if ln -sf "$LUNA_BIN" /usr/local/bin/lunaide 2>/dev/null; then
        echo "'lunaide' command installed at /usr/local/bin/lunaide"
    else
        LOCALBIN="$(eval echo ~$USER)/.local/bin"
        mkdir -p "$LOCALBIN"
        ln -sf "$LUNA_BIN" "$LOCALBIN/lunaide"
        echo "'lunaide' command installed at $LOCALBIN/lunaide"
        # Ensure ~/.local/bin is in PATH via .zshrc
        ZSHRC="$(eval echo ~$USER)/.zshrc"
        if [ -f "$ZSHRC" ] && ! grep -q '\.local/bin' "$ZSHRC"; then
            printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$ZSHRC"
            echo "  Added ~/.local/bin to PATH in ~/.zshrc"
        fi
    fi
else
    echo "Warning: Could not find lunaide binary at $LUNA_BIN"
fi

echo "=== Done! ==="
echo "Your app is ready at: $APP_DIR"

# Step 8: Fix macOS Quarantine & Codesigning
echo "Fixing macOS app signatures..."
xattr -cr "$APP_DIR"
codesign --force --deep --sign - "$APP_DIR"
