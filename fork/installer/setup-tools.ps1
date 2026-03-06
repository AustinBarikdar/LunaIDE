# ============================================================================
# LunaIDE Toolchain Setup — PowerShell
# Called by the NSIS installer or can be run standalone.
#
# Usage:
#   .\setup-tools.ps1 -Action toolchain   # Install Aftman + Rojo
#   .\setup-tools.ps1 -Action plugins     # Install Studio plugins
#   .\setup-tools.ps1 -Action all         # Both
# ============================================================================
param(
    [ValidateSet("toolchain", "plugins", "all")]
    [string]$Action = "all"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"  # Speed up Invoke-WebRequest

$AftmanDir = Join-Path $env:USERPROFILE ".aftman"
$AftmanBin = Join-Path $AftmanDir "bin"
$AftmanExe = Join-Path $AftmanBin "aftman.exe"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Get-GitHubLatestRelease {
    param([string]$Repo)
    try {
        $headers = @{ "User-Agent" = "LunaIDE-Setup" }
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers -TimeoutSec 15
        return $response.tag_name -replace '^v', ''
    } catch {
        return $null
    }
}

function Get-GitHubReleaseAssetUrl {
    param([string]$Repo, [string]$Pattern)
    try {
        $headers = @{ "User-Agent" = "LunaIDE-Setup" }
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers -TimeoutSec 15
        $asset = $response.assets | Where-Object { $_.name -like $Pattern } | Select-Object -First 1
        return $asset.browser_download_url
    } catch {
        return $null
    }
}

# ── Install Aftman ───────────────────────────────────────────────────────────

function Install-Aftman {
    if (Test-Path $AftmanExe) {
        Write-Host "Aftman already installed at: $AftmanExe"
        return $true
    }

    Write-Host "Downloading Aftman..."
    $assetUrl = Get-GitHubReleaseAssetUrl -Repo "LPGhatguy/aftman" -Pattern "*windows-x86_64.zip"

    if (-not $assetUrl) {
        Write-Host "ERROR: Could not find Aftman download URL."
        return $false
    }

    $tempZip = Join-Path $env:TEMP "aftman-setup.zip"
    $tempDir = Join-Path $env:TEMP "aftman-extract"

    try {
        Invoke-WebRequest -Uri $assetUrl -OutFile $tempZip -UseBasicParsing -TimeoutSec 60
        Write-Host "Extracting Aftman..."

        if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
        Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force

        # Find aftman.exe in the extracted files
        $extractedExe = Get-ChildItem -Path $tempDir -Recurse -Filter "aftman.exe" | Select-Object -First 1
        if (-not $extractedExe) {
            Write-Host "ERROR: aftman.exe not found in downloaded archive."
            return $false
        }

        # Run aftman self-install
        Write-Host "Running Aftman self-install..."
        $installResult = & $extractedExe.FullName self-install 2>&1
        Write-Host $installResult

        if (Test-Path $AftmanExe) {
            Write-Host "Aftman installed successfully at: $AftmanExe"

            # Add aftman bin to current session PATH so subsequent commands work
            if ($env:Path -notlike "*$AftmanBin*") {
                $env:Path = "$AftmanBin;$env:Path"
            }
            return $true
        } else {
            Write-Host "ERROR: Aftman self-install did not produce expected binary."
            return $false
        }
    } catch {
        Write-Host "ERROR: Failed to install Aftman: $_"
        return $false
    } finally {
        Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ── Install Rojo via Aftman ──────────────────────────────────────────────────

function Install-Rojo {
    if (-not (Test-Path $AftmanExe)) {
        Write-Host "Aftman not installed — skipping Rojo."
        return $false
    }

    # Check if Rojo is already installed via aftman
    $rojoStore = Join-Path $AftmanDir "tool-storage\rojo-rbx\rojo"
    if (Test-Path $rojoStore) {
        $versions = Get-ChildItem $rojoStore -Directory | Sort-Object Name -Descending
        if ($versions.Count -gt 0) {
            $rojoExe = Join-Path $versions[0].FullName "rojo.exe"
            if (Test-Path $rojoExe) {
                Write-Host "Rojo already installed: $($versions[0].Name)"
                return $true
            }
        }
    }

    Write-Host "Installing Rojo via Aftman..."

    try {
        # Get latest Rojo version
        $latestVersion = Get-GitHubLatestRelease -Repo "rojo-rbx/rojo"
        if (-not $latestVersion) {
            Write-Host "WARNING: Could not determine latest Rojo version. Using default."
            $latestVersion = "7.4.4"
        }

        Write-Host "Adding rojo-rbx/rojo@$latestVersion..."
        $addResult = & $AftmanExe add --global "rojo-rbx/rojo@$latestVersion" 2>&1
        Write-Host $addResult

        Write-Host "Running aftman install..."
        $installResult = & $AftmanExe install 2>&1
        Write-Host $installResult

        # Verify
        $rojoExe = Join-Path $rojoStore "$latestVersion\rojo.exe"
        if (Test-Path $rojoExe) {
            Write-Host "Rojo $latestVersion installed successfully."
            return $true
        }

        # Check aftman bin shim
        $rojoBinShim = Join-Path $AftmanBin "rojo.exe"
        if (Test-Path $rojoBinShim) {
            Write-Host "Rojo installed via aftman shim."
            return $true
        }

        Write-Host "WARNING: Rojo may not have installed correctly. You can install it manually later."
        return $false
    } catch {
        Write-Host "ERROR: Failed to install Rojo: $_"
        return $false
    }
}

# ── Install Studio Plugins ───────────────────────────────────────────────────

function Install-StudioPlugins {
    $pluginsDir = Join-Path $env:LOCALAPPDATA "Roblox\Plugins"

    if (-not (Test-Path $pluginsDir)) {
        New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
    }

    $scriptDir = Split-Path -Parent $MyInvocation.ScriptName
    # If run from NSIS, $scriptDir is the install dir. Otherwise fall back to script location.
    if (-not $scriptDir) { $scriptDir = $PSScriptRoot }

    $installedCount = 0

    # Look for bundled plugins in the extension assets
    $extDir = Join-Path $scriptDir "resources\app\extensions\roblox-ide.roblox-ide-core-0.1.0"

    # Install LunaIDE Studio plugin
    $lunaPlugin = Join-Path $extDir "LunaIDE.rbxmx"
    if (Test-Path $lunaPlugin) {
        Copy-Item $lunaPlugin (Join-Path $pluginsDir "LunaIDE.rbxmx") -Force
        Write-Host "LunaIDE Studio plugin installed."
        $installedCount++
    } else {
        Write-Host "WARNING: LunaIDE.rbxmx not found in bundle."
    }

    # Install Rojo sync plugin
    $rojoPlugin = Join-Path $extDir "Rojo.rbxm"
    if (Test-Path $rojoPlugin) {
        Copy-Item $rojoPlugin (Join-Path $pluginsDir "Rojo.rbxm") -Force
        Write-Host "Rojo sync plugin installed."
        $installedCount++
    } else {
        # Try downloading it
        Write-Host "Downloading Rojo sync plugin (v7.4.4)..."
        try {
            $rojoPluginUrl = "https://github.com/rojo-rbx/rojo/releases/download/v7.4.4/Rojo.rbxm"
            Invoke-WebRequest -Uri $rojoPluginUrl -OutFile (Join-Path $pluginsDir "Rojo.rbxm") -UseBasicParsing -TimeoutSec 30
            Write-Host "Rojo sync plugin downloaded and installed."
            $installedCount++
        } catch {
            Write-Host "WARNING: Could not download Rojo plugin: $_"
        }
    }

    Write-Host "Studio plugins installed: $installedCount"
    return $installedCount -gt 0
}

# ── Main ─────────────────────────────────────────────────────────────────────

Write-Host "============================================"
Write-Host "  LunaIDE Toolchain Setup"
Write-Host "============================================"
Write-Host ""

$exitCode = 0

if ($Action -eq "toolchain" -or $Action -eq "all") {
    $aftmanOk = Install-Aftman
    if ($aftmanOk) {
        $rojoOk = Install-Rojo
        if (-not $rojoOk) { $exitCode = 1 }
    } else {
        $exitCode = 1
    }
}

if ($Action -eq "plugins" -or $Action -eq "all") {
    $pluginsOk = Install-StudioPlugins
    if (-not $pluginsOk) { $exitCode = 1 }
}

Write-Host ""
Write-Host "Setup complete."
exit $exitCode
