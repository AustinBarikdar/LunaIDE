#!/bin/bash
# ============================================================================
# Build macOS .pkg Installer for LunaIDE
# Run after prepare.sh has created ~/LunaIDE-dist/LunaIDE.app
#
# Produces: ~/LunaIDE-dist/LunaIDE-Setup-darwin-arm64.pkg
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$HOME/LunaIDE-dist"
APP_PATH="$DIST_DIR/LunaIDE.app"
PKG_OUTPUT="$DIST_DIR/LunaIDE-Setup-darwin-arm64.pkg"
IDENTIFIER="com.lunaide.app"
VERSION="${1:-1.0.0}"

if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: LunaIDE.app not found at $APP_PATH"
    echo "Run fork/scripts/prepare.sh first."
    exit 1
fi

echo "=== Building LunaIDE macOS Installer ==="

# ── 1. Create staging area ───────────────────────────────────────────────────

STAGING_DIR=$(mktemp -d /tmp/lunaide-pkg-XXXXXX)
SCRIPTS_DIR=$(mktemp -d /tmp/lunaide-pkg-scripts-XXXXXX)

trap 'rm -rf "$STAGING_DIR" "$SCRIPTS_DIR"' EXIT

echo "Staging LunaIDE.app..."
mkdir -p "$STAGING_DIR/Applications"
cp -R "$APP_PATH" "$STAGING_DIR/Applications/LunaIDE.app"

# ── 2. Create installer scripts ─────────────────────────────────────────────

# The post-install script runs as the user after files are copied
cp "$SCRIPT_DIR/postinstall-macos.sh" "$SCRIPTS_DIR/postinstall"
chmod +x "$SCRIPTS_DIR/postinstall"

# ── 3. Build component package ───────────────────────────────────────────────

COMPONENT_DIR=$(mktemp -d /tmp/lunaide-pkg-components-XXXXXX)
COMPONENT_PKG="$COMPONENT_DIR/LunaIDE-component.pkg"

echo "Building component package..."
pkgbuild \
    --root "$STAGING_DIR" \
    --identifier "$IDENTIFIER" \
    --version "$VERSION" \
    --install-location "/" \
    --scripts "$SCRIPTS_DIR" \
    "$COMPONENT_PKG"

# ── 4. Create distribution XML for productbuild ─────────────────────────────

DIST_XML=$(mktemp /tmp/lunaide-dist-XXXXXX.xml)

cat > "$DIST_XML" << DISTEOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>LunaIDE</title>
    <welcome file="welcome.html" mime-type="text/html"/>
    <options customize="never" require-scripts="false" hostArchitectures="arm64,x86_64"/>
    <domains enable_localSystem="false" enable_currentUserHome="false" enable_anywhere="true"/>
    <choices-outline>
        <line choice="default">
            <line choice="com.lunaide.app"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="com.lunaide.app" visible="true" title="LunaIDE"
            description="LunaIDE Roblox Development Environment">
        <pkg-ref id="com.lunaide.app"/>
    </choice>
    <pkg-ref id="com.lunaide.app" version="$VERSION" onConclusion="none">LunaIDE-component.pkg</pkg-ref>
</installer-gui-script>
DISTEOF

# ── 5. Create welcome HTML ──────────────────────────────────────────────────

RESOURCES_DIR=$(mktemp -d /tmp/lunaide-pkg-resources-XXXXXX)
trap 'rm -rf "$STAGING_DIR" "$SCRIPTS_DIR" "$RESOURCES_DIR" "$COMPONENT_DIR" "$DIST_XML"' EXIT

cat > "$RESOURCES_DIR/welcome.html" << 'WELCOMEEOF'
<!DOCTYPE html>
<html>
<head>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    color: #333; padding: 20px; line-height: 1.6;
  }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  .subtitle { color: #666; font-size: 14px; margin-bottom: 20px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; font-size: 14px; }
  .note { margin-top: 20px; font-size: 12px; color: #888; }
</style>
</head>
<body>
  <h1>LunaIDE</h1>
  <p class="subtitle">Roblox Development Environment</p>
  <p>This installer will set up LunaIDE and your development toolchain:</p>
  <ul>
    <li><strong>LunaIDE</strong> — installed to /Applications</li>
    <li><strong>Aftman</strong> — Roblox toolchain manager</li>
    <li><strong>Rojo</strong> — file sync tool for Roblox Studio</li>
    <li><strong>Studio Plugins</strong> — LunaIDE + Rojo sync plugins</li>
    <li><strong>Shell Command</strong> — <code>lunaide</code> terminal command</li>
  </ul>
  <p class="note">Click "Continue" to proceed with the installation.</p>
</body>
</html>
WELCOMEEOF

# ── 6. Build final distribution package ──────────────────────────────────────

echo "Building distribution package..."
productbuild \
    --distribution "$DIST_XML" \
    --resources "$RESOURCES_DIR" \
    --package-path "$COMPONENT_DIR" \
    "$PKG_OUTPUT"

echo "=== Done! ==="
echo "Installer created at: $PKG_OUTPUT"
