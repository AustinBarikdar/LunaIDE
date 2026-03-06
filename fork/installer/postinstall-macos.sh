#!/bin/bash
# ============================================================================
# LunaIDE macOS Post-Install Script
# Runs after the .pkg installer copies LunaIDE.app to /Applications.
# Sets up Aftman, Rojo, Studio plugins, and the lunaide shell command.
# ============================================================================
set -euo pipefail

APP_DIR="/Applications/LunaIDE.app"
HOME_DIR=$(eval echo ~"$USER")
CORE_EXT_DIR="$APP_DIR/Contents/Resources/app/extensions/roblox-ide.roblox-ide-core-0.1.0"

log() { echo "[LunaIDE Setup] $*"; }

# ── 1. Install Aftman ───────────────────────────────────────────────────────

install_aftman() {
    local aftman_bin="$HOME_DIR/.aftman/bin/aftman"

    if [ -f "$aftman_bin" ]; then
        log "Aftman already installed."
        return 0
    fi

    log "Downloading Aftman..."

    local arch
    arch=$(uname -m)
    local asset_pattern
    if [ "$arch" = "arm64" ]; then
        asset_pattern="macos-aarch64"
    else
        asset_pattern="macos-x86_64"
    fi

    local asset_url
    asset_url=$(curl -s "https://api.github.com/repos/LPGhatguy/aftman/releases/latest" \
        | grep "browser_download_url.*${asset_pattern}.*\.zip" \
        | cut -d '"' -f 4 | head -n 1)

    if [ -z "$asset_url" ]; then
        log "WARNING: Could not find Aftman download URL."
        return 1
    fi

    local tmp_zip="/tmp/aftman-setup-$$.zip"
    local tmp_dir="/tmp/aftman-extract-$$"

    curl -sL -o "$tmp_zip" "$asset_url"
    mkdir -p "$tmp_dir"
    unzip -q -o "$tmp_zip" -d "$tmp_dir"

    local extracted_bin
    extracted_bin=$(find "$tmp_dir" -name "aftman" -type f | head -1)

    if [ -z "$extracted_bin" ]; then
        log "WARNING: aftman binary not found in archive."
        rm -rf "$tmp_zip" "$tmp_dir"
        return 1
    fi

    chmod +x "$extracted_bin"
    "$extracted_bin" self-install || true

    rm -rf "$tmp_zip" "$tmp_dir"

    if [ -f "$aftman_bin" ]; then
        log "Aftman installed successfully."
        # Ensure aftman bin is in PATH for this session
        export PATH="$HOME_DIR/.aftman/bin:$PATH"
        return 0
    else
        log "WARNING: Aftman self-install did not produce expected binary."
        return 1
    fi
}

# ── 2. Install Rojo via Aftman ───────────────────────────────────────────────

install_rojo() {
    local aftman_bin="$HOME_DIR/.aftman/bin/aftman"

    if [ ! -f "$aftman_bin" ]; then
        log "Aftman not installed — skipping Rojo."
        return 1
    fi

    # Check if Rojo is already installed
    local rojo_store="$HOME_DIR/.aftman/tool-storage/rojo-rbx/rojo"
    if [ -d "$rojo_store" ]; then
        local latest_ver
        latest_ver=$(ls "$rojo_store" 2>/dev/null | sort -V | tail -1)
        local exe_name="rojo"
        if [ -n "$latest_ver" ] && [ -f "$rojo_store/$latest_ver/$exe_name" ]; then
            log "Rojo already installed: $latest_ver"
            return 0
        fi
    fi

    log "Installing Rojo via Aftman..."

    # Get latest version
    local latest
    latest=$(curl -s "https://api.github.com/repos/rojo-rbx/rojo/releases/latest" \
        | grep '"tag_name"' | head -1 | sed 's/.*"v\(.*\)".*/\1/')

    if [ -z "$latest" ]; then
        latest="7.4.4"
        log "Could not determine latest Rojo version, using $latest"
    fi

    log "Adding rojo-rbx/rojo@$latest..."
    "$aftman_bin" add --global "rojo-rbx/rojo@$latest" 2>&1 || true

    log "Running aftman install..."
    "$aftman_bin" install 2>&1 || true

    # Verify
    if [ -f "$HOME_DIR/.aftman/bin/rojo" ]; then
        log "Rojo installed successfully."
        return 0
    else
        log "WARNING: Rojo may not have installed correctly."
        return 1
    fi
}

# ── 3. Install Studio Plugins ───────────────────────────────────────────────

install_plugins() {
    local plugins_dir="$HOME_DIR/Documents/Roblox/Plugins"
    mkdir -p "$plugins_dir"

    local count=0

    # LunaIDE Studio plugin
    local luna_plugin="$CORE_EXT_DIR/LunaIDE.rbxmx"
    if [ -f "$luna_plugin" ]; then
        cp "$luna_plugin" "$plugins_dir/LunaIDE.rbxmx"
        log "LunaIDE Studio plugin installed."
        count=$((count + 1))
    fi

    # Rojo sync plugin
    local rojo_plugin="$CORE_EXT_DIR/Rojo.rbxm"
    if [ -f "$rojo_plugin" ]; then
        cp "$rojo_plugin" "$plugins_dir/Rojo.rbxm"
        log "Rojo sync plugin installed."
        count=$((count + 1))
    else
        # Download if not bundled
        log "Downloading Rojo sync plugin (v7.4.4)..."
        if curl -sL "https://github.com/rojo-rbx/rojo/releases/download/v7.4.4/Rojo.rbxm" -o "$plugins_dir/Rojo.rbxm"; then
            log "Rojo sync plugin downloaded."
            count=$((count + 1))
        else
            log "WARNING: Could not download Rojo plugin."
        fi
    fi

    log "Studio plugins installed: $count"
}

# ── 4. Install lunaide shell command ─────────────────────────────────────────

install_shell_command() {
    local bin_source="$APP_DIR/Contents/Resources/app/bin/codium"

    if [ ! -f "$bin_source" ]; then
        log "WARNING: Shell command source not found at $bin_source"
        return 1
    fi

    # Try /usr/local/bin first, fall back to ~/.local/bin
    if ln -sf "$bin_source" /usr/local/bin/lunaide 2>/dev/null; then
        log "Shell command installed at /usr/local/bin/lunaide"
        return 0
    fi

    local local_bin="$HOME_DIR/.local/bin"
    mkdir -p "$local_bin"
    ln -sf "$bin_source" "$local_bin/lunaide"
    log "Shell command installed at $local_bin/lunaide"

    # Add to PATH in .zshrc if needed
    local zshrc="$HOME_DIR/.zshrc"
    if [ -f "$zshrc" ] && ! grep -q '\.local/bin' "$zshrc"; then
        printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$zshrc"
        log "Added ~/.local/bin to PATH in ~/.zshrc"
    fi
}

# ── 5. Pre-create user settings ──────────────────────────────────────────────

create_default_settings() {
    local settings_dir="$HOME_DIR/Library/Application Support/lunaide/User"
    local settings_file="$settings_dir/settings.json"

    if [ -f "$settings_file" ]; then
        log "User settings already exist, skipping."
        return 0
    fi

    mkdir -p "$settings_dir"
    cat > "$settings_file" << 'SETTINGS_EOF'
{
  "workbench.startupEditor": "none",
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false
}
SETTINGS_EOF
    log "Default user settings created."
}

# ── 6. Fix signatures ───────────────────────────────────────────────────────

fix_signatures() {
    if [ -d "$APP_DIR" ]; then
        log "Fixing macOS app signatures..."
        xattr -cr "$APP_DIR" 2>/dev/null || true
        codesign --force --deep --sign - "$APP_DIR" 2>/dev/null || true
        log "App re-signed."
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

log "============================================"
log "  LunaIDE macOS Setup"
log "============================================"

install_aftman || true
install_rojo || true
install_plugins || true
install_shell_command || true
create_default_settings || true
fix_signatures || true

log ""
log "Setup complete! Launch LunaIDE from /Applications."
exit 0
