#!/bin/bash
# LunaIDE Fast Fork — Prepare + Build for Windows
# Downloads the latest pre-built VSCodium for Windows x64 and patches it into LunaIDE.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$HOME/LunaIDE-dist-win"

AUTH_ARGS=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
    AUTH_ARGS=("-H" "Authorization: Bearer ${GITHUB_TOKEN}")
fi

echo "=== LunaIDE Fast Build (Windows) ==="

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# Step 1: Get the latest VSCodium download URL for win32-x64 zip
echo "Fetching latest VSCodium release..."
LATEST_ASSET_URL=$(curl -s ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "https://api.github.com/repos/VSCodium/vscodium/releases/latest" | grep "browser_download_url.*win32-x64-.*\.zip\"" | grep -v "sha[0-9]" | cut -d '"' -f 4 | head -n 1 || true)

# If latest release doesn't have Windows builds yet, try the previous releases
if [ -z "$LATEST_ASSET_URL" ]; then
    echo "Latest release missing Windows builds, checking previous releases..."
    LATEST_ASSET_URL=$(curl -s ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "https://api.github.com/repos/VSCodium/vscodium/releases?per_page=5" | grep "browser_download_url.*win32-x64-.*\.zip\"" | grep -v "sha[0-9]" | cut -d '"' -f 4 | head -n 1 || true)
fi

if [ -z "$LATEST_ASSET_URL" ]; then
    echo "Failed to find VSCodium download URL."
    exit 1
fi

ZIP_FILE="vscodium-win.zip"
echo "Downloading $LATEST_ASSET_URL..."
curl -L -o "$ZIP_FILE" "$LATEST_ASSET_URL"

# Step 2: Extract the App
echo "Extracting..."
rm -rf "LunaIDE"
unzip -q "$ZIP_FILE" -d "LunaIDE"
rm "$ZIP_FILE"

APP_DIR="$OUT_DIR/LunaIDE"

# Step 3: Rename Executable
echo "Renaming executable..."
mv "$APP_DIR/VSCodium.exe" "$APP_DIR/LunaIDE.exe"

if [ -f "$APP_DIR/bin/codium" ]; then
    mv "$APP_DIR/bin/codium" "$APP_DIR/bin/lunaide"
    sed -i.bak 's/VSCodium\.exe/LunaIDE\.exe/g' "$APP_DIR/bin/lunaide"
    rm -f "$APP_DIR/bin/lunaide.bak"
fi
if [ -f "$APP_DIR/bin/codium.cmd" ]; then
    mv "$APP_DIR/bin/codium.cmd" "$APP_DIR/bin/lunaide.cmd"
    sed -i.bak 's/VSCodium\.exe/LunaIDE\.exe/g' "$APP_DIR/bin/lunaide.cmd"
    rm -f "$APP_DIR/bin/lunaide.cmd.bak"
fi

# Step 3b: Replace application icon
echo "Replacing application icon..."
ICON_PATH="$ROOT_DIR/fork/assets/lunaide-icon.ico"
RCEDIT_EXE="$OUT_DIR/rcedit-x64.exe"
if [ -f "$ICON_PATH" ]; then
    if [ ! -f "$RCEDIT_EXE" ]; then
        curl -sL "https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe" -o "$RCEDIT_EXE"
    fi
    if [ -f "$RCEDIT_EXE" ]; then
        "$RCEDIT_EXE" "$APP_DIR/LunaIDE.exe" --set-icon "$ICON_PATH" \
            && echo "Icon replaced successfully." \
            || echo "Warning: Could not replace icon in LunaIDE.exe"
    else
        echo "Warning: rcedit download failed, skipping icon replacement."
    fi
else
    echo "Warning: Icon not found at $ICON_PATH, skipping icon replacement."
fi

# Step 4: Patch product.json
echo "Patching product.json..."
# Windows portable uses resources/app/product.json
PRODUCT_JSON="$APP_DIR/resources/app/product.json"

if [ ! -f "$PRODUCT_JSON" ]; then
    mkdir -p "$APP_DIR/resources/app"
fi

if [ -f "$PRODUCT_JSON" ]; then
    sed -i.bak 's/VSCodium/LunaIDE/g' "$PRODUCT_JSON"
    sed -i.bak 's/vscodium/lunaide/g' "$PRODUCT_JSON"
    sed -i.bak 's/codium/lunaide/g' "$PRODUCT_JSON"
    sed -i.bak 's/\.vscode-oss/\.lunaide/g' "$PRODUCT_JSON"
fi

python -c "
import json, sys, os
app_product_path = sys.argv[1]
branding_product_path = sys.argv[2]

if not os.path.exists(app_product_path):
    print('No product.json found at', app_product_path, '- creating one.')
    app_product = {}
else:
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

commit = app_product.get('commit')
version = app_product.get('version')
date = app_product.get('date')

branding_settings = branding_product.pop('defaultSettings', {})
app_product.update(branding_product)
if 'configurationDefaults' not in app_product:
    app_product['configurationDefaults'] = {}
app_product['configurationDefaults'].update(branding_settings)

if commit: app_product['commit'] = commit
if version: app_product['version'] = version
if date: app_product['date'] = date

app_product.pop('settings', None)
app_product.pop('checksums', None)

with open(app_product_path, 'w') as f:
    json.dump(app_product, f, indent=2)
" "$PRODUCT_JSON" "$ROOT_DIR/fork/branding/product.json"

# Step 5: Patch workbench JS
echo "Patching workbench.desktop.main.js..."
WORKBENCH_JS="$APP_DIR/resources/app/out/vs/workbench/workbench.desktop.main.js"
if [ -f "$WORKBENCH_JS" ]; then
    python -c "
import sys
p = sys.argv[1]
data = open(p, 'rb').read()
for old in [b'default:\"welcomePage\"', b'default:\"welcomePageInEmptyWorkbench\"']:
    new = b'default:\"none\"' + b' ' * (len(old) - len(b'default:\"none\"'))
    data = data.replace(old, new)
data = data.replace(b'minimumWidth=48,this.maximumWidth=48', b'minimumWidth=40,this.maximumWidth=40')
open(p, 'wb').write(data)
" "$WORKBENCH_JS"
fi

echo "Patching workbench css..."
WORKBENCH_CSS="$APP_DIR/resources/app/out/vs/workbench/workbench.desktop.main.css"
if [ -f "$WORKBENCH_CSS" ]; then
    python -c "
import sys
p = sys.argv[1]
data = open(p, 'r', encoding='utf-8').read()
data = data.replace('activitybar{width:48px;', 'activitybar{width:40px;')
data = data.replace('width:48px;height:48px;', 'width:40px;height:40px;')
data = data.replace('.action-label.codicon{font-size:24px;', '.action-label.codicon{font-size:20px;')
data = data.replace('padding:0 0 0 48px', 'padding:0 0 0 40px')
data = data.replace('width:48px;height:2px;', 'width:40px;height:2px;')
data = data.replace('top:24px;right:8px', 'top:20px;right:6px')
data = data.replace('top:24px;right:6px', 'top:20px;right:4px')
data = data.replace(
    'editor-group-container>.title{position:relative;box-sizing:border-box;overflow:hidden}',
    'editor-group-container>.title{position:relative;box-sizing:border-box;overflow:visible}'
)
data = data.replace('outline-offset:-2px}', 'outline-offset:-2px;border-radius:8px 8px 0 0}', 1)
tab_css = '\n.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container{padding-top:3px!important}'
tab_css += '\n.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab>.tab-border-top-container{display:none!important}'
tab_css += '\n.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab.active{box-shadow:inset 0 1px 0 var(--tab-border-top-color)!important}'
if '/*# sourceMappingURL=' in data:
    data = data.replace('/*# sourceMappingURL=', tab_css + '\n/*# sourceMappingURL=')
else:
    data += tab_css
open(p, 'w', encoding='utf-8').write(data)
" "$WORKBENCH_CSS"
fi

# Step 6: Patch package.json
PACKAGE_JSON="$APP_DIR/resources/app/package.json"
if [ -f "$PACKAGE_JSON" ]; then
    python -c "
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
fi

echo "Building extensions..."
cd "$ROOT_DIR"
pnpm build

# Step 7: Download Luau LSP for Windows (win64)
echo "Downloading luau-lsp..."
LUAU_LSP_ASSET_URL=$(curl -s ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "https://api.github.com/repos/JohnnyMorganz/luau-lsp/releases/latest" | grep "browser_download_url.*win64\.zip" | cut -d '"' -f 4 | head -n 1)
if [ -n "$LUAU_LSP_ASSET_URL" ]; then
    mkdir -p "$ROOT_DIR/packages/core/assets/bin"
    TMP_ZIP="/tmp/luau-lsp-$$.zip"
    curl -L -o "$TMP_ZIP" "$LUAU_LSP_ASSET_URL"
    unzip -o -j "$TMP_ZIP" "luau-lsp.exe" -d "$ROOT_DIR/packages/core/assets/bin"
    rm -f "$TMP_ZIP"
    echo "luau-lsp downloaded."
else
    echo "Warning: Could not find luau-lsp Windows release."
fi

# Step 8: Build extensions into app bundle
echo "Injecting extensions..."
EXT_DIR="$APP_DIR/resources/app/extensions"
CORE_VERSION=$(jq -r '.version' "$ROOT_DIR/packages/core/package.json")
MCP_VERSION=$(jq -r '.version' "$ROOT_DIR/packages/mcp-server/package.json")
CORE_EXT_DIR="$EXT_DIR/roblox-ide.roblox-ide-core-${CORE_VERSION}"
MCP_EXT_DIR="$EXT_DIR/roblox-ide.roblox-ide-mcp-${MCP_VERSION}"

mkdir -p "$CORE_EXT_DIR"
mkdir -p "$MCP_EXT_DIR"

# Build the Studio plugin
echo "Building LunaIDE Studio plugin..."
rojo build "$ROOT_DIR/packages/studio-plugin/default.project.json" -o "$ROOT_DIR/packages/core/LunaIDE.rbxmx" || true

cp -r "$ROOT_DIR/packages/core/dist" "$CORE_EXT_DIR/"
cp "$ROOT_DIR/packages/core/package.json" "$CORE_EXT_DIR/"
cp -r "$ROOT_DIR/packages/core/assets" "$CORE_EXT_DIR/"
cp "$ROOT_DIR/packages/core/language-configuration.json" "$CORE_EXT_DIR/"

echo "Downloading Roblox globalTypes.d.luau..."
curl -sL "https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/main/scripts/globalTypes.d.luau" \
  -o "$CORE_EXT_DIR/assets/globalTypes.d.luau" \
  || echo "Warning: Could not download globalTypes.d.luau"

cp -r "$ROOT_DIR/packages/mcp-server/dist" "$MCP_EXT_DIR/"
cp "$ROOT_DIR/packages/mcp-server/package.json" "$MCP_EXT_DIR/"

# Step 9: Inject Default Settings
echo "Injecting default settings..."
mkdir -p "$APP_DIR/resources/app/product"
# Copy from branding
cp "$ROOT_DIR/fork/branding/product.json" "$APP_DIR/resources/app/product/defaultSettings.json" 2>/dev/null || true

# Step 10: Replace watermarks and application icon SVG
echo "Replacing editor watermark and app icon..."
MEDIA_DIR="$APP_DIR/resources/app/out/media"
MOON_PATH='M 60 20 A 30 30 0 1 0 80 75 A 35 35 0 1 1 60 20 Z'
mkdir -p "$MEDIA_DIR"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#B2B2B2\" fill-opacity=\".3\"/></svg>" > "$MEDIA_DIR/letterpress-dark.svg"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#B2B2B2\" fill-opacity=\".1\"/></svg>" > "$MEDIA_DIR/letterpress-light.svg"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#ffffff\" fill-opacity=\".6\"/></svg>" > "$MEDIA_DIR/letterpress-hcDark.svg"
echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" viewBox=\"0 0 100 100\"><path d=\"$MOON_PATH\" fill=\"#000000\" fill-opacity=\".15\"/></svg>" > "$MEDIA_DIR/letterpress-hcLight.svg"

# Replace the top-left application icon (code-icon.svg) with LunaIDE moon
cat > "$MEDIA_DIR/code-icon.svg" << 'ICONEOF'
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
ICONEOF
echo "App icon SVG replaced."

# Step 11: Rojo sync plugin
echo "Downloading Rojo sync plugin (v7.4.4)..."
ROJO_PLUGIN_OUT="$CORE_EXT_DIR/Rojo.rbxm"
curl -sL "https://github.com/rojo-rbx/rojo/releases/download/v7.4.4/Rojo.rbxm" -o "$ROJO_PLUGIN_OUT" || true

echo "=== Done! ==="
echo "Your app is ready at: $APP_DIR"
