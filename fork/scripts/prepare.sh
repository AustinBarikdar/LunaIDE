#!/bin/bash
# LunaIDE Fast Fork — Prepare + Build
# Downloads the latest pre-built VSCodium for macOS ARM64 and patches it into LunaIDE.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$HOME/LunaIDE-dist"

AUTH_ARGS=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
    AUTH_ARGS=("-H" "Authorization: Bearer ${GITHUB_TOKEN}")
fi

echo "=== LunaIDE Fast Build ==="

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# Step 1: Get the latest VSCodium download URL for darwin-arm64
echo "Fetching latest VSCodium release..."
LATEST_ASSET_URL=$(curl -s ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "https://api.github.com/repos/VSCodium/vscodium/releases/latest" | grep "browser_download_url.*darwin-arm64.*\.zip" | cut -d '"' -f 4 | head -n 1)

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
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable LunaIDE" "$PLIST"
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

# Inject fork/branding/product.json into the app's product.json
python3 -c "
import json, sys
app_product_path = sys.argv[1]
branding_product_path = sys.argv[2]

# Load both JSON files
try:
    with open(app_product_path, 'r') as f:
        app_product = json.load(f)
except Exception as e:
    print(f'Error reading app product.json: {e}')
    sys.exit(1)

try:
    with open(branding_product_path, 'r') as f:
        branding_product = json.load(f)
except Exception as e:
    print(f'Error reading branding product.json: {e}')
    branding_product = {}

# Preserve important keys from original
commit = app_product.get('commit')
version = app_product.get('version')
date = app_product.get('date')

# Grab the defaultSettings from branding
branding_settings = branding_product.pop('defaultSettings', {})

# Merge rest of branding into app product
app_product.update(branding_product)

# Map defaultSettings to configurationDefaults which VS Code expects
if 'configurationDefaults' not in app_product:
    app_product['configurationDefaults'] = {}
app_product['configurationDefaults'].update(branding_settings)

# Restore original keys if not provided in branding
if commit: app_product['commit'] = commit
if version: app_product['version'] = version
if date: app_product['date'] = date

# Clean up unwanted keys
app_product.pop('settings', None)
app_product.pop('checksums', None)

with open(app_product_path, 'w') as f:
    json.dump(app_product, f, indent=2)
" "$PRODUCT_JSON" "$ROOT_DIR/fork/branding/product.json"

# Step 5.4: Patch workbench JS — replace ALL hardcoded welcomePage defaults with "none"
echo "Patching workbench.desktop.main.js (startupEditor defaults)..."
WORKBENCH_JS="$APP_DIR/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js"
python3 -c "
import sys
p = sys.argv[1]
data = open(p, 'rb').read()
# Replace both known hardcoded default values (byte-padded to preserve file length)
for old in [b'default:\"welcomePage\"', b'default:\"welcomePageInEmptyWorkbench\"']:
    new = b'default:\"none\"' + b' ' * (len(old) - len(b'default:\"none\"'))
    data = data.replace(old, new)
# Shrink activity bar JS layout width (48 -> 40)
data = data.replace(b'minimumWidth=48,this.maximumWidth=48', b'minimumWidth=40,this.maximumWidth=40')
open(p, 'wb').write(data)
" "$WORKBENCH_JS"

# Step 5.4b: Shrink activity bar (48px → 40px) + rounded tabs
echo "Patching activity bar size and tab styling..."
WORKBENCH_CSS="$APP_DIR/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.css"
python3 -c "
import sys
p = sys.argv[1]
data = open(p, 'r', encoding='utf-8').read()
# Shrink activitybar width
data = data.replace('activitybar{width:48px;', 'activitybar{width:40px;')
# Shrink icon container size
data = data.replace('width:48px;height:48px;', 'width:40px;height:40px;')
# Shrink icon font size
data = data.replace('.action-label.codicon{font-size:24px;', '.action-label.codicon{font-size:20px;')
# Fix padding reference to 48px
data = data.replace('padding:0 0 0 48px', 'padding:0 0 0 40px')
# Fix drag indicator width
data = data.replace('width:48px;height:2px;', 'width:40px;height:2px;')
# Fix badge positioning
data = data.replace('top:24px;right:8px', 'top:20px;right:6px')
# Fix profile overlay positioning
data = data.replace('top:24px;right:6px', 'top:20px;right:4px')
# Unclip title container so rounded tab corners are visible
data = data.replace(
    'editor-group-container>.title{position:relative;box-sizing:border-box;overflow:hidden}',
    'editor-group-container>.title{position:relative;box-sizing:border-box;overflow:visible}'
)
# Inject rounded tab corners into existing tab rule
data = data.replace('outline-offset:-2px}', 'outline-offset:-2px;border-radius:8px 8px 0 0}', 1)
# Inject padding-top on tabs-container so rounded corners have space to show
# Also hide the absolute top border container, and instead use an inset box-shadow for the active tab top border to respect the border-radius
tab_css = '\\n.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container{padding-top:3px!important}'
tab_css += '\\n.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab>.tab-border-top-container{display:none!important}'
tab_css += '\\n.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab.active{box-shadow:inset 0 1px 0 var(--tab-border-top-color)!important}'
if '/*# sourceMappingURL=' in data:
    data = data.replace('/*# sourceMappingURL=', tab_css + '\\n/*# sourceMappingURL=')
else:
    data += tab_css
open(p, 'w', encoding='utf-8').write(data)
" "$WORKBENCH_CSS"

# Step 5.5: Patch package.json inside the app to fix Safe Storage name
echo "Patching app/package.json..."
PACKAGE_JSON="$APP_DIR/Contents/Resources/app/package.json"
python3 -c "
import sys, json
p = sys.argv[1]
try:
    with open(p, 'r') as f:
        data = json.load(f)
    data['name'] = 'LunaIDE'
    with open(p, 'w') as f:
        json.dump(data, f, indent=2)
except Exception as e:
    print(f'Error patching package.json: {e}')
" "$PACKAGE_JSON"

# Step 5.6: Patch the main executable for the Safe Storage keychain string
echo "Patching executable keychain strings..."
# Find the main executable file (avoiding helpers)
EXEC_NAME=$(ls "$APP_DIR/Contents/MacOS" | grep -v "Helper" | head -n 1)
EXEC_FILE="$APP_DIR/Contents/MacOS/$EXEC_NAME"

if [ -z "$EXEC_NAME" ]; then
    echo "Error: Could not find main executable in $APP_DIR/Contents/MacOS"
    exit 1
fi

# We pad "LunaIDE  Safe Storage" to match the exact byte length of "VSCodium Safe Storage"
LC_ALL=C sed -i.bak 's/VSCodium Safe Storage/LunaIDE  Safe Storage/g' "$EXEC_FILE"
rm -f "$EXEC_FILE.bak"

if [ "$EXEC_NAME" != "LunaIDE" ]; then
    mv "$EXEC_FILE" "$APP_DIR/Contents/MacOS/LunaIDE"
fi

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
    mkdir -p "$(dirname "$LUA_BIN_OUT")"
    cp "$LUA_TMP/lua-5.1.5/src/lua" "$LUA_BIN_OUT"
    chmod +x "$LUA_BIN_OUT"
    rm -rf "$LUA_TMP"
    echo "Lua 5.1 built and bundled."
else
    echo "Lua 5.1 already bundled, skipping build."
fi

# Download luau-lsp binary for macOS (bundled into extension)
echo "Downloading luau-lsp..."
LUAU_LSP_ASSET_URL=$(curl -s ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "https://api.github.com/repos/JohnnyMorganz/luau-lsp/releases/latest" | grep "browser_download_url.*macos\.zip" | cut -d '"' -f 4 | head -n 1)
if [ -n "$LUAU_LSP_ASSET_URL" ]; then
    mkdir -p "$ROOT_DIR/packages/core/assets/bin"
    TMP_ZIP="/tmp/luau-lsp-$$.zip"
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
  "workbench.colorTheme": "LunaIDE Tokyo Night",
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "update.mode": "none",
  "workbench.accounts.visibility": "hidden",
  "files.exclude": {
    "**/.lunaide/.port": true,
    "**/sourcemap.json": true,
    "**/.git": true
  },
  "workbench.colorCustomizations": {
    "editor.background": "#1a1b26",
    "editor.foreground": "#c0caf5",
    "editor.lineHighlightBackground": "#292e42",
    "editor.selectionBackground": "#283457",
    "editor.inactiveSelectionBackground": "#28345780",
    "editor.selectionHighlightBackground": "#28345760",
    "editor.wordHighlightBackground": "#28345760",
    "editor.wordHighlightStrongBackground": "#28345790",
    "editor.findMatchBackground": "#3d59a166",
    "editor.findMatchHighlightBackground": "#3d59a133",
    "editorCursor.foreground": "#c0caf5",
    "editorWhitespace.foreground": "#363b54",
    "editorIndentGuide.background1": "#292e42",
    "editorIndentGuide.activeBackground1": "#565f89",
    "editorLineNumber.foreground": "#363b54",
    "editorLineNumber.activeForeground": "#737aa2",
    "editorBracketMatch.background": "#28345780",
    "editorBracketMatch.border": "#7aa2f7",
    "editorGutter.addedBackground": "#9ece6a",
    "editorGutter.modifiedBackground": "#7aa2f7",
    "editorGutter.deletedBackground": "#f7768e",
    "editorOverviewRuler.addedForeground": "#9ece6a80",
    "editorOverviewRuler.modifiedForeground": "#7aa2f780",
    "editorOverviewRuler.deletedForeground": "#f7768e80",
    "editorError.foreground": "#f7768e",
    "editorWarning.foreground": "#e0af68",
    "editorInfo.foreground": "#7aa2f7",
    "editorHint.foreground": "#2ac3de",
    "editorWidget.background": "#1f2335",
    "editorWidget.border": "#292e42",
    "editorSuggestWidget.background": "#1f2335",
    "editorSuggestWidget.border": "#292e42",
    "editorSuggestWidget.selectedBackground": "#283457",
    "editorSuggestWidget.highlightForeground": "#7aa2f7",
    "editorHoverWidget.background": "#1f2335",
    "editorHoverWidget.border": "#292e42",
    "sideBar.background": "#1f2335",
    "sideBar.foreground": "#c0caf5",
    "sideBar.border": "#292e42",
    "sideBarTitle.foreground": "#c0caf5",
    "sideBarSectionHeader.background": "#1f2335",
    "sideBarSectionHeader.foreground": "#c0caf5",
    "sideBarSectionHeader.border": "#292e42",
    "activityBar.background": "#1f2335",
    "activityBar.foreground": "#7aa2f7",
    "activityBar.inactiveForeground": "#565f89",
    "activityBar.border": "#292e42",
    "activityBarBadge.background": "#7aa2f7",
    "activityBarBadge.foreground": "#1a1b26",
    "activityBar.activeBorder": "#7aa2f7",
    "titleBar.activeBackground": "#1f2335",
    "titleBar.activeForeground": "#c0caf5",
    "titleBar.inactiveBackground": "#1f2335",
    "titleBar.inactiveForeground": "#565f89",
    "titleBar.border": "#292e42",
    "statusBar.background": "#1f2335",
    "statusBar.foreground": "#a9b1d6",
    "statusBar.border": "#292e42",
    "statusBar.debuggingBackground": "#7aa2f7",
    "statusBar.debuggingForeground": "#1a1b26",
    "statusBar.noFolderBackground": "#1f2335",
    "statusBarItem.remoteBackground": "#7aa2f7",
    "statusBarItem.remoteForeground": "#1a1b26",
    "statusBarItem.hoverBackground": "#292e42",
    "tab.activeBackground": "#1a1b26",
    "tab.activeForeground": "#c0caf5",
    "tab.inactiveBackground": "#1f2335",
    "tab.inactiveForeground": "#565f89",
    "tab.border": "#292e42",
    "tab.activeBorderTop": "#7aa2f7",
    "tab.hoverBackground": "#292e42",
    "editorGroupHeader.tabsBackground": "#1f2335",
    "editorGroupHeader.tabsBorder": "#292e42",
    "panel.background": "#1f2335",
    "panel.border": "#292e42",
    "panelTitle.activeForeground": "#c0caf5",
    "panelTitle.activeBorder": "#7aa2f7",
    "panelTitle.inactiveForeground": "#565f89",
    "terminal.background": "#1a1b26",
    "terminal.foreground": "#c0caf5",
    "terminal.ansiBlack": "#414868",
    "terminal.ansiRed": "#f7768e",
    "terminal.ansiGreen": "#9ece6a",
    "terminal.ansiYellow": "#e0af68",
    "terminal.ansiBlue": "#7aa2f7",
    "terminal.ansiMagenta": "#bb9af7",
    "terminal.ansiCyan": "#2ac3de",
    "terminal.ansiWhite": "#c0caf5",
    "terminal.ansiBrightBlack": "#565f89",
    "terminal.ansiBrightRed": "#f7768e",
    "terminal.ansiBrightGreen": "#9ece6a",
    "terminal.ansiBrightYellow": "#e0af68",
    "terminal.ansiBrightBlue": "#7aa2f7",
    "terminal.ansiBrightMagenta": "#bb9af7",
    "terminal.ansiBrightCyan": "#2ac3de",
    "terminal.ansiBrightWhite": "#c0caf5",
    "terminalCursor.foreground": "#c0caf5",
    "input.background": "#1a1b26",
    "input.foreground": "#c0caf5",
    "input.border": "#292e42",
    "input.placeholderForeground": "#565f89",
    "inputOption.activeBorder": "#7aa2f7",
    "inputValidation.errorBackground": "#f7768e33",
    "inputValidation.errorBorder": "#f7768e",
    "inputValidation.warningBackground": "#e0af6833",
    "inputValidation.warningBorder": "#e0af68",
    "inputValidation.infoBackground": "#7aa2f733",
    "inputValidation.infoBorder": "#7aa2f7",
    "dropdown.background": "#1a1b26",
    "dropdown.border": "#292e42",
    "dropdown.foreground": "#c0caf5",
    "dropdown.listBackground": "#1a1b26",
    "list.hoverBackground": "#292e42",
    "list.activeSelectionBackground": "#283457",
    "list.activeSelectionForeground": "#c0caf5",
    "list.inactiveSelectionBackground": "#28345780",
    "list.inactiveSelectionForeground": "#c0caf5",
    "list.focusBackground": "#283457",
    "list.focusForeground": "#c0caf5",
    "list.highlightForeground": "#7aa2f7",
    "list.errorForeground": "#f7768e",
    "list.warningForeground": "#e0af68",
    "button.background": "#7aa2f7",
    "button.foreground": "#1a1b26",
    "button.hoverBackground": "#89b4fa",
    "button.secondaryBackground": "#292e42",
    "button.secondaryForeground": "#c0caf5",
    "button.secondaryHoverBackground": "#3b4261",
    "badge.background": "#7aa2f7",
    "badge.foreground": "#1a1b26",
    "scrollbar.shadow": "#00000033",
    "scrollbarSlider.background": "#565f8933",
    "scrollbarSlider.hoverBackground": "#565f8966",
    "scrollbarSlider.activeBackground": "#565f8999",
    "focusBorder": "#3d59a1",
    "foreground": "#c0caf5",
    "widget.shadow": "#00000033",
    "selection.background": "#283457",
    "descriptionForeground": "#a9b1d6",
    "icon.foreground": "#c0caf5",
    "quickInput.background": "#1f2335",
    "quickInput.foreground": "#c0caf5",
    "quickInputList.focusBackground": "#283457",
    "quickInputTitle.background": "#1f2335",
    "peekView.border": "#3d59a1",
    "peekViewEditor.background": "#1a1b26",
    "peekViewResult.background": "#1f2335",
    "peekViewTitle.background": "#1f2335",
    "peekViewTitleLabel.foreground": "#c0caf5",
    "peekViewTitleDescription.foreground": "#a9b1d6",
    "diffEditor.insertedTextBackground": "#9ece6a22",
    "diffEditor.removedTextBackground": "#f7768e22",
    "notifications.background": "#1f2335",
    "notifications.foreground": "#c0caf5",
    "notifications.border": "#292e42",
    "notificationLink.foreground": "#7aa2f7",
    "minimap.findMatchHighlight": "#7aa2f766",
    "minimap.selectionHighlight": "#28345799",
    "minimapGutter.addedBackground": "#9ece6a",
    "minimapGutter.modifiedBackground": "#7aa2f7",
    "minimapGutter.deletedBackground": "#f7768e",
    "breadcrumb.foreground": "#565f89",
    "breadcrumb.focusForeground": "#c0caf5",
    "breadcrumb.activeSelectionForeground": "#c0caf5",
    "breadcrumbPicker.background": "#1f2335",
    "gitDecoration.addedResourceForeground": "#9ece6a",
    "gitDecoration.modifiedResourceForeground": "#7aa2f7",
    "gitDecoration.deletedResourceForeground": "#f7768e",
    "gitDecoration.untrackedResourceForeground": "#73daca",
    "gitDecoration.ignoredResourceForeground": "#565f89",
    "gitDecoration.conflictingResourceForeground": "#e0af68",
    "debugToolBar.background": "#1f2335",
    "debugIcon.breakpointForeground": "#f7768e",
    "debugIcon.startForeground": "#9ece6a",
    "debugIcon.stopForeground": "#f7768e",
    "debugIcon.pauseForeground": "#e0af68",
    "commandCenter.background": "#1f2335",
    "commandCenter.foreground": "#c0caf5",
    "commandCenter.border": "#292e42",
    "commandCenter.activeForeground": "#c0caf5",
    "commandCenter.activeBackground": "#292e42"
  },
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "name": "Comments",
        "scope": "comment, punctuation.definition.comment",
        "settings": {
          "foreground": "#565f89",
          "fontStyle": "italic"
        }
      },
      {
        "name": "Keywords",
        "scope": "keyword, storage.type, storage.modifier",
        "settings": {
          "foreground": "#bb9af7"
        }
      },
      {
        "name": "Control keywords",
        "scope": "keyword.control, keyword.operator.new",
        "settings": {
          "foreground": "#bb9af7"
        }
      },
      {
        "name": "Operators",
        "scope": "keyword.operator, punctuation.separator",
        "settings": {
          "foreground": "#89ddff"
        }
      },
      {
        "name": "Strings",
        "scope": "string, punctuation.definition.string",
        "settings": {
          "foreground": "#9ece6a"
        }
      },
      {
        "name": "Numbers",
        "scope": "constant.numeric",
        "settings": {
          "foreground": "#ff9e64"
        }
      },
      {
        "name": "Constants",
        "scope": "constant.language, variable.language.self, variable.language.this",
        "settings": {
          "foreground": "#ff9e64"
        }
      },
      {
        "name": "Built-in constants",
        "scope": "constant.other, support.constant",
        "settings": {
          "foreground": "#ff9e64"
        }
      },
      {
        "name": "Functions",
        "scope": "entity.name.function, support.function, meta.function-call",
        "settings": {
          "foreground": "#7aa2f7"
        }
      },
      {
        "name": "Function parameters",
        "scope": "variable.parameter",
        "settings": {
          "foreground": "#e0af68"
        }
      },
      {
        "name": "Types / Classes",
        "scope": "entity.name.type, entity.name.class, support.type, support.class",
        "settings": {
          "foreground": "#2ac3de"
        }
      },
      {
        "name": "Interfaces",
        "scope": "entity.name.type.interface",
        "settings": {
          "foreground": "#2ac3de"
        }
      },
      {
        "name": "Variables",
        "scope": "variable, variable.other",
        "settings": {
          "foreground": "#c0caf5"
        }
      },
      {
        "name": "Properties",
        "scope": "variable.other.property, variable.other.object.property, support.variable.property",
        "settings": {
          "foreground": "#7dcfff"
        }
      },
      {
        "name": "Punctuation",
        "scope": "punctuation.definition.block, punctuation.definition.parameters, punctuation.section, meta.brace",
        "settings": {
          "foreground": "#9abdf5"
        }
      },
      {
        "name": "Tags (HTML/XML)",
        "scope": "entity.name.tag",
        "settings": {
          "foreground": "#f7768e"
        }
      },
      {
        "name": "Tag attributes",
        "scope": "entity.other.attribute-name",
        "settings": {
          "foreground": "#bb9af7"
        }
      },
      {
        "name": "Decorators / Annotations",
        "scope": "meta.decorator, entity.name.function.decorator",
        "settings": {
          "foreground": "#e0af68"
        }
      },
      {
        "name": "Escape characters",
        "scope": "constant.character.escape",
        "settings": {
          "foreground": "#89ddff"
        }
      },
      {
        "name": "Regex",
        "scope": "string.regexp",
        "settings": {
          "foreground": "#b4f9f8"
        }
      },
      {
        "name": "Markdown headings",
        "scope": "markup.heading, entity.name.section",
        "settings": {
          "foreground": "#7aa2f7",
          "fontStyle": "bold"
        }
      },
      {
        "name": "Markdown bold",
        "scope": "markup.bold",
        "settings": {
          "foreground": "#e0af68",
          "fontStyle": "bold"
        }
      },
      {
        "name": "Markdown italic",
        "scope": "markup.italic",
        "settings": {
          "foreground": "#bb9af7",
          "fontStyle": "italic"
        }
      },
      {
        "name": "Markdown link",
        "scope": "markup.underline.link",
        "settings": {
          "foreground": "#73daca"
        }
      },
      {
        "name": "Markdown code",
        "scope": "markup.inline.raw, markup.fenced_code",
        "settings": {
          "foreground": "#9ece6a"
        }
      },
      {
        "name": "JSON keys",
        "scope": "support.type.property-name.json",
        "settings": {
          "foreground": "#7aa2f7"
        }
      },
      {
        "name": "YAML keys",
        "scope": "entity.name.tag.yaml",
        "settings": {
          "foreground": "#7aa2f7"
        }
      },
      {
        "name": "CSS selectors",
        "scope": "entity.other.attribute-name.class.css, entity.other.attribute-name.id.css",
        "settings": {
          "foreground": "#2ac3de"
        }
      },
      {
        "name": "CSS properties",
        "scope": "support.type.property-name.css",
        "settings": {
          "foreground": "#7dcfff"
        }
      },
      {
        "name": "CSS values",
        "scope": "support.constant.property-value.css, meta.property-value.css",
        "settings": {
          "foreground": "#ff9e64"
        }
      }
    ],
    "semanticHighlighting": true
  },
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "function": "#7aa2f7",
      "method": "#7aa2f7",
      "variable": "#c0caf5",
      "parameter": "#e0af68",
      "property": "#7dcfff",
      "type": "#2ac3de",
      "class": "#2ac3de",
      "interface": "#2ac3de",
      "enum": "#2ac3de",
      "enumMember": "#ff9e64",
      "namespace": "#bb9af7",
      "string": "#9ece6a",
      "number": "#ff9e64",
      "keyword": "#bb9af7",
      "comment": "#565f89",
      "regexp": "#b4f9f8"
    }
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

# Step 9: Build the LunaIDE Studio plugin and install the Rojo sync plugin
ROBLOX_PLUGINS_DIR="$HOME/Documents/Roblox/Plugins"
mkdir -p "$ROBLOX_PLUGINS_DIR"

# 9a: Build the LunaIDE Studio plugin from source
echo "Building LunaIDE Studio plugin..."
set +e
ROJO_BIN=$(find ~/.aftman/tool-storage/rojo-rbx/rojo -name rojo -type f 2>/dev/null | head -1)
if [ -z "$ROJO_BIN" ]; then
    ROJO_BIN=$(command -v rojo 2>/dev/null)
fi
set -e

PLUGIN_OUT="$ROBLOX_PLUGINS_DIR/LunaIDE.rbxmx"
if [ -n "$ROJO_BIN" ]; then
    "$ROJO_BIN" build "$ROOT_DIR/packages/studio-plugin/default.project.json" --output "$PLUGIN_OUT"
    echo "LunaIDE Studio plugin installed to: $PLUGIN_OUT"
    # Bundle the built plugin into the app extension so _installPlugin() can copy it without rojo
    cp "$PLUGIN_OUT" "$CORE_EXT_DIR/LunaIDE.rbxmx"
    echo "LunaIDE Studio plugin bundled into app at: $CORE_EXT_DIR/LunaIDE.rbxmx"
else
    echo "Warning: Rojo not found. Cannot build LunaIDE Studio plugin."
fi

# 9b: Download the Rojo sync plugin separately (needed for file syncing)
echo "Downloading Rojo sync plugin (v7.4.4)..."
ROJO_PLUGIN_OUT="$ROBLOX_PLUGINS_DIR/Rojo.rbxm"
if curl -sL "https://github.com/rojo-rbx/rojo/releases/download/v7.4.4/Rojo.rbxm" -o "$ROJO_PLUGIN_OUT"; then
    echo "Rojo sync plugin installed to: $ROJO_PLUGIN_OUT"
    # Also copy it to the extension folder so it's backed up inside the app bundle
    cp "$ROJO_PLUGIN_OUT" "$CORE_EXT_DIR/Rojo.rbxm"
else
    echo "Warning: Failed to download Rojo v7.4.4 plugin. File syncing may not work."
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

# Step 10.5: Pre-create user settings so VSCodium never shows its welcome page on first launch
echo "Pre-creating user settings..."
LUNAIDE_USER_DIR="$HOME/Library/Application Support/lunaide/User"
LUNAIDE_SETTINGS="$LUNAIDE_USER_DIR/settings.json"
if [ ! -f "$LUNAIDE_SETTINGS" ]; then
    mkdir -p "$LUNAIDE_USER_DIR"
    cat << 'SETTINGS_EOF' > "$LUNAIDE_SETTINGS"
{
  "workbench.startupEditor": "none",
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false
}
SETTINGS_EOF
    echo "User settings created at: $LUNAIDE_SETTINGS"
else
    echo "User settings already exist, skipping."
fi

echo "=== Done! ==="
echo "Your app is ready at: $APP_DIR"

# Step 8: Fix macOS Quarantine & Codesigning
echo "Fixing macOS app signatures..."
xattr -cr "$APP_DIR"
codesign --force --deep --sign - "$APP_DIR"
