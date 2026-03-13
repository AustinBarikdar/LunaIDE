import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { getLatestGitHubRelease } from './toolUpdateChecker.js';

const IDE_REPO = 'AustinBarikdar/LunaIDE';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_KEY = 'lunaide.ideUpdate.lastChecked';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class IdeUpdateChecker implements vscode.Disposable {
    private timer: ReturnType<typeof setInterval> | undefined;
    private disposables: vscode.Disposable[] = [];
    private pendingUpdate: { version: string; zipPath: string; appPath: string } | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.disposables.push(
            vscode.commands.registerCommand('lunaide.checkForIdeUpdates', () => this.checkForUpdates(true)),
            vscode.commands.registerCommand('lunaide.applyIdeUpdate', () => this.applyPendingUpdate()),
            vscode.commands.registerCommand('lunaide.setGitHubToken', () => this.setGitHubToken())
        );
    }

    async setGitHubToken(): Promise<void> {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your GitHub Personal Access Token (PAT)',
            password: true,
            placeHolder: 'ghp_...',
        });

        if (token) {
            await this.context.secrets.store('lunaide.githubToken', token);
            vscode.window.showInformationMessage('GitHub PAT saved successfully.');
        } else if (token !== undefined) {
            await this.context.secrets.delete('lunaide.githubToken');
            vscode.window.showInformationMessage('GitHub PAT cleared.');
        }
    }

    async checkForUpdates(force = false): Promise<void> {
        // Always ensure the background timer is running, regardless of network outcome.
        if (!this.timer) {
            this.timer = setInterval(() => { void this.checkForUpdates(); }, CHECK_INTERVAL_MS);
        }

        const lastChecked = this.context.globalState.get<number>(CACHE_KEY, 0);
        if (!force && Date.now() - lastChecked < CACHE_TTL_MS) return;

        try {
            const latest = await getLatestGitHubRelease(IDE_REPO, this.context);
            if (!latest) {
                if (force) {
                    const token = await this.context.secrets.get('lunaide.githubToken');
                    if (!token) {
                        const choice = await vscode.window.showWarningMessage(
                            'Failed to check for updates. The LunaIDE repository is private, so a GitHub Personal Access Token (PAT) is required.',
                            'Set Token'
                        );
                        if (choice === 'Set Token') {
                            await this.setGitHubToken();
                            await this.checkForUpdates(true);
                        }
                    } else {
                        vscode.window.showErrorMessage('Failed to check for updates. Is your GitHub token valid?');
                    }
                }
                return;
            }

            await this.context.globalState.update(CACHE_KEY, Date.now());

            const current = this.context.extension.packageJSON.version as string;
            if (compareSemver(latest, current) > 0) {
                const choice = await vscode.window.showInformationMessage(
                    `LunaIDE v${latest} is available! (you have v${current})`,
                    'Download & Install',
                    'Later'
                );
                if (choice === 'Download & Install') {
                    await this.downloadAndInstall(latest);
                }
            } else if (force) {
                vscode.window.showInformationMessage(`LunaIDE is up to date (v${current}).`);
            }
        } catch (err: any) {
            if (force) {
                vscode.window.showErrorMessage(`Error checking for updates: ${err.message}`);
            }
        }
    }

    private async downloadAndInstall(version: string): Promise<void> {
        const appPath = getAppBundlePath();
        if (!appPath) {
            vscode.window.showErrorMessage('Unable to determine application path for update.');
            return;
        }

        const token = await this.context.secrets.get('lunaide.githubToken');
        const assetUrl = await findAssetUrl(version, token);
        if (!assetUrl) {
            vscode.window.showErrorMessage(
                `No update package found for your platform. Please download manually.`,
                'Open Releases'
            ).then((c) => {
                if (c === 'Open Releases') {
                    void vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${IDE_REPO}/releases/latest`));
                }
            });
            return;
        }

        const zipPath = path.join(os.tmpdir(), `lunaide-update-${version}.zip`);

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Downloading LunaIDE v${version}…`,
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ increment: 0 });
                    let lastPct = 0;
                    await downloadFile(assetUrl, zipPath, token, (pct) => {
                        const delta = pct - lastPct;
                        lastPct = pct;
                        progress.report({ increment: delta, message: `${Math.round(pct)}%` });
                    });
                }
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Update download failed: ${msg}`);
            return;
        }

        this.pendingUpdate = { version, zipPath, appPath };

        const choice = await vscode.window.showInformationMessage(
            `LunaIDE v${version} is ready. Restart to apply the update.`,
            'Restart & Update',
            'Later'
        );
        if (choice === 'Restart & Update') {
            await this.applyPendingUpdate();
        }
    }

    private async applyPendingUpdate(): Promise<void> {
        if (!this.pendingUpdate) {
            vscode.window.showInformationMessage('No pending update. Run "LunaIDE: Check for IDE Updates" to download one.');
            return;
        }

        const { version, zipPath, appPath } = this.pendingUpdate;
        const updateDir = path.join(os.tmpdir(), `lunaide-update-${version}`);

        if (process.platform === 'win32') {
            const scriptPath = path.join(os.tmpdir(), `lunaide-updater-${version}.js`);
            const backupPath = `${appPath}.bak`;
            const exeName = 'LunaIDE.exe';
            const logPath = `${scriptPath}.log`;
            const ppid = process.pid;

            // We generate a tiny Node.js script. It must run from outside appPath to avoid Windows file lock conflicts.
            const script = `
const fs = require('fs');
const path = require('path');
const { spawn, execSync, spawnSync } = require('child_process');

const logPath = ${JSON.stringify(logPath)};
function log(msg) {
    fs.appendFileSync(logPath, msg + '\\n');
}
function die(msg) {
    log('FATAL: ' + msg);
    const vbs = path.join(process.env.TMP || process.env.TEMP, 'lunaide-die.vbs');
    fs.writeFileSync(vbs, 'MsgBox "' + msg + '", 16, "LunaIDE Update Failed"');
    execSync('wscript.exe "' + vbs + '"');
    try { fs.unlinkSync(vbs); } catch(e) {}
    process.exit(1);
}

log('=== LunaIDE updater started at ' + new Date().toISOString() + ' ===');
log('PID=' + process.pid + '  PPID=' + ${ppid});

const appPath = ${JSON.stringify(appPath)};
const updateDir = ${JSON.stringify(updateDir)};
const zipPath = ${JSON.stringify(zipPath)};
const backupPath = ${JSON.stringify(backupPath)};
const exePath = path.join(appPath, ${JSON.stringify(exeName)});
const ppid = ${ppid};

log('APP=' + appPath);
log('EXE=' + exePath);

function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

function killProcessesFromAppDir() {
    try {
        const psAppPath = appPath.replace(/'/g, "''");
        const psScript = "$app='" + psAppPath + "'; " +
            "Get-CimInstance Win32_Process | " +
            "Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($app, [System.StringComparison]::OrdinalIgnoreCase) } | " +
            "ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }";
        spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
            stdio: 'ignore',
            windowsHide: true
        });
    } catch (e) {
        log('Warning: process cleanup failed: ' + (e && e.message ? e.message : String(e)));
    }
}

async function run() {
    // Ensure this updater process is not "inside" appPath, otherwise Windows can block renames.
    try { process.chdir(path.dirname(appPath)); } catch (e) {}

    // 1. Wait for parent IDE process to quit
    log('Waiting for LunaIDE (PID ' + ppid + ') to exit...');
    for (let i = 0; i < 120; i++) {
        if (!isProcessRunning(ppid)) {
            log('LunaIDE process exited.');
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Force kill if it's still alive
    if (isProcessRunning(ppid)) {
        log('Force killing PID ' + ppid);
        try { execSync('taskkill /PID ' + ppid + ' /T /F', { stdio: 'ignore' }); } catch(e) {}
        try { process.kill(ppid, 'SIGKILL'); } catch(e) {}
        await new Promise(r => setTimeout(r, 2000));
    }

    // Kill any straggler helper processes loaded from the current app directory.
    killProcessesFromAppDir();
    await new Promise(r => setTimeout(r, 1000));

    // 2. Extract
    log('Extracting archive...');
    try {
        fs.mkdirSync(updateDir, { recursive: true });
        // Use powershell Expand-Archive as it's built-in on Windows 10+
        execSync(\`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '\${zipPath}' -DestinationPath '\${updateDir}' -Force"\`);
    } catch (err) {
        die('Failed to extract update archive: ' + err.message);
    }

    // Find extracted root
    let extractedRoot = updateDir;
    let dirs = fs.readdirSync(updateDir).map(n => path.join(updateDir, n));
    if (dirs.length === 1 && fs.statSync(dirs[0]).isDirectory() && !fs.existsSync(path.join(updateDir, ${JSON.stringify(exeName)}))) {
        extractedRoot = dirs[0];
    }

    // Deep search if not found
    if (!fs.existsSync(path.join(extractedRoot, ${JSON.stringify(exeName)}))) {
        function findExe(dir) {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const p = path.join(dir, f);
                if (fs.statSync(p).isDirectory()) {
                    const found = findExe(p);
                    if (found) return found;
                } else if (f.toLowerCase() === ${JSON.stringify(exeName.toLowerCase())}) {
                    return dir;
                }
            }
            return null;
        }
        const found = findExe(updateDir);
        if (found) extractedRoot = found;
        else die(${JSON.stringify(exeName)} + ' not found in downloaded package');
    }
    log('Found new app at: ' + extractedRoot);

    // 3. Swap
    log('Swapping app directory...');
    try {
        if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });

        let retries = 20;
        while(retries > 0) {
            try {
                fs.renameSync(appPath, backupPath);
                break;
            } catch(e) {
                killProcessesFromAppDir();
                if (--retries === 0) throw e;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (err) {
        die('Could not move current app aside (still locked by another process): ' + err.message);
    }

    try {
        fs.renameSync(extractedRoot, appPath);
    } catch (err) {
        log('Move failed, restoring backup...');
        try { fs.renameSync(backupPath, appPath); } catch(e) {}
        die('Could not place new app (restored backup): ' + err.message);
    }
    log('Swap complete');

    // 4. Pre-launch sanity check
    if (!fs.existsSync(exePath)) die('Binary not found after swap: ' + exePath);
    log('Binary validated: ' + exePath);

    // 5. Cleanup
    log('Cleaning up...');
    try { fs.rmSync(backupPath, { recursive: true, force: true }); } catch(e) {}
    try { fs.rmSync(updateDir, { recursive: true, force: true }); } catch(e) {}
    try { fs.unlinkSync(zipPath); } catch(e) {}

    // 6. Relaunch
    log('Relaunching LunaIDE...');
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VSCODE_IPC_HOOK;
    delete env.VSCODE_IPC_HOOK_EXTHOST;

    const child = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        env
    });
    child.unref();

    log('=== Update complete ===');
    try { fs.unlinkSync(__filename); } catch(e) {}
    process.exit(0);
}

run().catch(e => die('Unexpected error: ' + e.message));
`;

            fs.writeFileSync(scriptPath, script);

            const nodeHostPath = await findExternalWindowsNodeHost(appPath);
            if (nodeHostPath) {
                const child = spawn(nodeHostPath, [scriptPath], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                    cwd: os.tmpdir(),
                    env: {
                        ...process.env,
                    }
                });
                child.unref();
            } else {
                const psScriptPath = path.join(os.tmpdir(), `lunaide-updater-${version}.ps1`);
                const psLogPath = `${psScriptPath}.log`;
                const psScript = buildWindowsPowerShellUpdaterScript({
                    appPath,
                    updateDir,
                    zipPath,
                    backupPath,
                    exeName,
                    ppid,
                    logPath: psLogPath,
                });
                fs.writeFileSync(psScriptPath, psScript, 'utf8');

                const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true,
                    cwd: os.tmpdir(),
                });
                child.unref();
            }

        } else if (process.platform === 'darwin') {
            const scriptPath = path.join(os.tmpdir(), `lunaide-updater-${version}.sh`);

            // Main binary name derived from the .app bundle
            const appName = path.basename(appPath, '.app');

            const script = [
                '#!/bin/bash',
                `set -ux`,
                `LOG="${scriptPath}.log"`,
                `exec > "$LOG" 2>&1`,
                `echo "=== LunaIDE updater started at $(date) ==="`,
                `echo "PID=$$  PPID=$PPID"`,
                ``,
                `die() { echo "FATAL: $1"; osascript -e "display alert \\"LunaIDE update failed\\" message \\"$1\\""; exit 1; }`,
                ``,
                `APP="${appPath}"`,
                `BACKUP="${appPath}.bak"`,
                `ZIP="${zipPath}"`,
                `EXTRACT="${updateDir}"`,
                `APP_BIN="$APP/Contents/MacOS/${appName}"`,
                ``,
                `echo "APP=$APP"`,
                `echo "APP_BIN=$APP_BIN"`,
                ``,
                `# --- 1. Wait for the app to fully quit (pgrep on the .app bundle) ---`,
                `echo "Waiting for LunaIDE processes to exit..."`,
                `for i in $(seq 1 120); do`,
                `  if ! pgrep -f "LunaIDE.app" >/dev/null 2>&1; then`,
                `    echo "All LunaIDE processes exited after $i iterations"`,
                `    break`,
                `  fi`,
                `  sleep 0.5`,
                `done`,
                `# If still running after 60s, force kill all processes matching the bundle`,
                `if pgrep -f "LunaIDE.app" >/dev/null 2>&1; then`,
                `  echo "Force killing all LunaIDE processes..."`,
                `  pkill -9 -f "LunaIDE.app" || true`,
                `  sleep 2`,
                `fi`,
                ``,
                `# --- 2. Extract ---`,
                `echo "Extracting archive..."`,
                `mkdir -p "$EXTRACT" || die "Could not create temp directory"`,
                `unzip -o "$ZIP" -d "$EXTRACT" > /dev/null 2>&1 || die "Failed to extract update archive"`,
                ``,
                `# Find the .app bundle (may be nested one level)`,
                `NEW_APP="$EXTRACT/LunaIDE.app"`,
                `if [ ! -d "$NEW_APP" ]; then`,
                `  NEW_APP=$(find "$EXTRACT" -maxdepth 2 -name "*.app" -type d | head -1)`,
                `fi`,
                `if [ -z "$NEW_APP" ] || [ ! -d "$NEW_APP" ]; then`,
                `  die ".app bundle not found in downloaded package"`,
                `fi`,
                `echo "Found new app at: $NEW_APP"`,
                ``,
                `# --- 3. Swap ---`,
                `echo "Swapping app bundle..."`,
                `rm -rf "$BACKUP" 2>/dev/null || true`,
                `mv "$APP" "$BACKUP" || die "Could not move current app aside (check permissions)"`,
                `mv "$NEW_APP" "$APP" || { mv "$BACKUP" "$APP" 2>/dev/null; die "Could not place new app (restored backup)"; }`,
                `echo "Swap complete"`,
                ``,
                `# --- 4. Re-codesign (ad-hoc, required for patched binaries) ---`,
                `echo "Re-signing..."`,
                `xattr -cr "$APP" || true`,
                `codesign --force --deep --sign - "$APP" || echo "Warning: codesign failed"`,
                ``,
                `# --- 5. Pre-launch sanity check ---`,
                `if [ ! -x "$APP_BIN" ]; then`,
                `  die "Binary not found or not executable: $APP_BIN"`,
                `fi`,
                `echo "Binary validated: $APP_BIN"`,
                ``,
                `# --- 6. Cleanup ---`,
                `echo "Cleaning up..."`,
                `rm -rf "$BACKUP" "$EXTRACT" "$ZIP" 2>/dev/null || true`,
                ``,
                `# --- 7. Relaunch ---`,
                `echo "Relaunching LunaIDE..."`,
                `sleep 2`,
                `unset ELECTRON_RUN_AS_NODE`,
                `unset VSCODE_IPC_HOOK`,
                `unset VSCODE_IPC_HOOK_EXTHOST`,
                `open -n "$APP"`,
                `echo "=== Update complete at $(date) ==="`,

            ].join('\n');

            fs.writeFileSync(scriptPath, script, { mode: 0o755 });

            // Fully detach the updater from Electron using a detached spawn.
            // detached: true + unref() creates a process that survives the
            // parent's exit, equivalent to nohup but without requiring it.
            const child = spawn('/bin/bash', [scriptPath], {
                stdio: 'ignore',
                detached: true,
            });
            child.unref();
        } else {
            vscode.window.showErrorMessage('Auto-update is not supported on this platform.');
            return;
        }

        // Save all dirty documents to prevent the quit dialog from blocking exit
        await vscode.workspace.saveAll(false);

        // Give the double-fork a moment to complete before quitting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Quit so the script can replace the .app / exe
        void vscode.commands.executeCommand('workbench.action.quit');
    }

    dispose(): void {
        if (this.timer) clearInterval(this.timer);
        for (const d of this.disposables) d.dispose();
    }
}

/** Derive the macOS .app bundle path or Windows .exe parent directory from the running Electron binary path. */
function getAppBundlePath(): string | undefined {
    if (process.platform === 'darwin') {
        // process.execPath → /path/to/LunaIDE.app/Contents/MacOS/Electron
        const marker = '.app/Contents/';
        const idx = process.execPath.indexOf(marker);
        if (idx === -1) return undefined;
        return process.execPath.slice(0, idx + 4); // up to and including ".app"
    } else if (process.platform === 'win32') {
        // process.execPath → C:\path\to\LunaIDE\LunaIDE.exe
        return path.dirname(process.execPath);
    }
    return undefined;
}

async function findExternalWindowsNodeHost(appPath: string): Promise<string | undefined> {
    const candidates = new Set<string>();
    const addCandidate = (candidate: string | undefined) => {
        if (!candidate) return;
        const trimmed = candidate.trim();
        if (!trimmed) return;
        candidates.add(trimmed);
    };

    await new Promise<void>((resolve) => {
        try {
            const child = spawn('where.exe', ['node'], {
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true,
            });
            let output = '';
            child.stdout?.on('data', (chunk: Buffer) => {
                output += chunk.toString();
            });
            child.on('close', () => {
                for (const line of output.split(/\r?\n/)) {
                    addCandidate(line);
                }
                resolve();
            });
            child.on('error', () => resolve());
        } catch {
            resolve();
        }
    });

    addCandidate(path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs', 'node.exe'));
    addCandidate(path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'nodejs', 'node.exe'));
    addCandidate(path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nodejs', 'node.exe'));

    const appRoot = path.resolve(appPath).toLowerCase();
    for (const candidate of candidates) {
        try {
            if (!fs.existsSync(candidate)) continue;
            const resolved = path.resolve(candidate);
            const normalized = resolved.toLowerCase();
            if (normalized.startsWith(appRoot + path.sep.toLowerCase()) || normalized === appRoot) {
                continue;
            }
            return resolved;
        } catch {
            // Keep trying next candidate
        }
    }

    return undefined;
}

function buildWindowsPowerShellUpdaterScript(params: {
    appPath: string;
    updateDir: string;
    zipPath: string;
    backupPath: string;
    exeName: string;
    ppid: number;
    logPath: string;
}): string {
    const appPath = toPowerShellSingleQuoted(params.appPath);
    const updateDir = toPowerShellSingleQuoted(params.updateDir);
    const zipPath = toPowerShellSingleQuoted(params.zipPath);
    const backupPath = toPowerShellSingleQuoted(params.backupPath);
    const exeName = toPowerShellSingleQuoted(params.exeName);
    const logPath = toPowerShellSingleQuoted(params.logPath);

    return [
        `$ErrorActionPreference = 'Stop'`,
        `Set-Location -Path $env:TEMP`,
        `$LogPath = ${logPath}`,
        `function Write-Log([string]$Message) {`,
        `  Add-Content -Path $LogPath -Value $Message`,
        `}`,
        `function Fail([string]$Message) {`,
        `  Write-Log ("FATAL: " + $Message)`,
        `  exit 1`,
        `}`,
        `Write-Log ("=== LunaIDE PowerShell updater started at " + (Get-Date).ToString("s") + " ===")`,
        `$AppPath = ${appPath}`,
        `$UpdateDir = ${updateDir}`,
        `$ZipPath = ${zipPath}`,
        `$BackupPath = ${backupPath}`,
        `$ExeName = ${exeName}`,
        `$ParentPid = ${params.ppid}`,
        `$ExePath = Join-Path $AppPath $ExeName`,
        `Write-Log ("APP=" + $AppPath)`,
        `Write-Log ("EXE=" + $ExePath)`,
        `Write-Log ("Waiting for LunaIDE process " + $ParentPid + " to exit...")`,
        `for ($i = 0; $i -lt 120; $i++) {`,
        `  if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }`,
        `  Start-Sleep -Seconds 1`,
        `}`,
        `if (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) {`,
        `  Write-Log ("Force killing PID " + $ParentPid)`,
        `  Stop-Process -Id $ParentPid -Force -ErrorAction SilentlyContinue`,
        `  Start-Sleep -Seconds 2`,
        `}`,
        `Write-Log "Extracting archive..."`,
        `New-Item -ItemType Directory -Path $UpdateDir -Force | Out-Null`,
        `try {`,
        `  Expand-Archive -Path $ZipPath -DestinationPath $UpdateDir -Force`,
        `} catch {`,
        `  Fail ("Failed to extract update archive: " + $_.Exception.Message)`,
        `}`,
        `$ExtractedRoot = $UpdateDir`,
        `$DirectExe = Join-Path $UpdateDir $ExeName`,
        `if (Test-Path $DirectExe) {`,
        `  $ExtractedRoot = $UpdateDir`,
        `} else {`,
        `  $NestedExe = Get-ChildItem -Path $UpdateDir -Filter $ExeName -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1`,
        `  if (-not $NestedExe) { Fail ($ExeName + " not found in downloaded package") }`,
        `  $ExtractedRoot = $NestedExe.Directory.FullName`,
        `}`,
        `Write-Log ("Found new app at: " + $ExtractedRoot)`,
        `if (Test-Path $BackupPath) {`,
        `  Remove-Item -Path $BackupPath -Recurse -Force -ErrorAction SilentlyContinue`,
        `}`,
        `$MovedCurrent = $false`,
        `for ($retry = 0; $retry -lt 20; $retry++) {`,
        `  $AppPathForScan = $AppPath`,
        `  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($AppPathForScan, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object {`,
        `    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { }`,
        `  }`,
        `  try {`,
        `    Move-Item -LiteralPath $AppPath -Destination $BackupPath -Force`,
        `    $MovedCurrent = $true`,
        `    break`,
        `  } catch {`,
        `    Start-Sleep -Seconds 1`,
        `  }`,
        `}`,
        `if (-not $MovedCurrent) {`,
        `  Fail "Could not move current app aside (likely still locked)."`,
        `}`,
        `try {`,
        `  Move-Item -LiteralPath $ExtractedRoot -Destination $AppPath -Force`,
        `} catch {`,
        `  Write-Log "Move failed, restoring backup..."`,
        `  try { Move-Item -LiteralPath $BackupPath -Destination $AppPath -Force } catch {}`,
        `  Fail ("Could not place new app (restored backup): " + $_.Exception.Message)`,
        `}`,
        `if (-not (Test-Path $ExePath)) {`,
        `  Fail ("Binary not found after swap: " + $ExePath)`,
        `}`,
        `Write-Log ("Binary validated: " + $ExePath)`,
        `Write-Log "Cleaning up..."`,
        `try { Remove-Item -Path $BackupPath -Recurse -Force -ErrorAction SilentlyContinue } catch {}`,
        `try { Remove-Item -Path $UpdateDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}`,
        `try { Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue } catch {}`,
        `Write-Log "Relaunching LunaIDE..."`,
        `Start-Process -FilePath $ExePath`,
        `Write-Log "=== Update complete ==="`,
        `exit 0`,
        ``,
    ].join('\r\n');
}

function toPowerShellSingleQuoted(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Fetch the release from GitHub and return the download URL for the matching platform asset. */
function findAssetUrl(version: string, token?: string): Promise<string | undefined> {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';

    return new Promise((resolve) => {
        const options: https.RequestOptions = {
            hostname: 'api.github.com',
            path: `/repos/${IDE_REPO}/releases/tags/v${version}`,
            headers: {
                'User-Agent': 'LunaIDE',
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            timeout: 10000,
        };

        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    const assets: Array<{ name: string; url: string; browser_download_url: string }> = release.assets ?? [];
                    // Prefer exact platform+arch match, fall back to any zip
                    const asset =
                        assets.find(a => a.name.endsWith('.zip') && a.name.toLowerCase().includes(platform) && a.name.toLowerCase().includes(arch)) ??
                        assets.find(a => a.name.endsWith('.zip') && a.name.toLowerCase().includes(platform)) ??
                        assets.find(a => a.name.endsWith('.zip'));

                    // Note: If using a PAT on a private repo, browser_download_url might still 404 because it redirects to an S3 url that needs the token passed as an API call to the asset endpoint directly, OR the API can just download the asset url by setting accept to octet-stream. We'll use the API url for downloads with token.
                    if (asset) {
                        resolve(token ? asset.url : asset.browser_download_url);
                    } else {
                        resolve(undefined);
                    }
                } catch {
                    resolve(undefined);
                }
            });
            res.on('error', () => resolve(undefined));
        });
        req.on('error', () => resolve(undefined));
        req.on('timeout', () => { req.destroy(); resolve(undefined); });
    });
}

/** Download a URL to a local file, reporting progress as 0–100. Follows redirects. */
function downloadFile(url: string, dest: string, token?: string, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const follow = (targetUrl: string) => {
            const parsed = new URL(targetUrl);
            const isApi = parsed.hostname === 'api.github.com';
            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: {
                    'User-Agent': 'LunaIDE',
                    // When hitting api.github.com for an asset download, we MUST set Accept to application/octet-stream
                    ...(isApi ? { Accept: 'application/octet-stream' } : {}),
                    // Only send auth token to api.github.com, sending it to AWS S3 (redirect) causes errors
                    ...((isApi && token) ? { Authorization: `Bearer ${token}` } : {})
                },
                timeout: 120000,
            };
            const req = https.get(options, (res) => {
                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                    follow(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const total = parseInt(res.headers['content-length'] ?? '0', 10);
                let received = 0;
                const file = fs.createWriteStream(dest);
                res.on('data', (chunk: Buffer) => {
                    received += chunk.length;
                    if (total > 0) onProgress?.((received / total) * 100);
                });
                res.on('error', reject);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', reject);
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
        };
        follow(url);
    });
}

function compareSemver(a: string, b: string): number {
    const parse = (v: string) => {
        const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
        if (!match) return { major: 0, minor: 0, patch: 0, prerelease: '' };
        return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10), prerelease: match[4] || '' };
    };
    const pa = parse(a);
    const pb = parse(b);
    if (pa.major !== pb.major) return pa.major - pb.major;
    if (pa.minor !== pb.minor) return pa.minor - pb.minor;
    if (pa.patch !== pb.patch) return pa.patch - pb.patch;
    if (!pa.prerelease && pb.prerelease) return 1;
    if (pa.prerelease && !pb.prerelease) return -1;
    return pa.prerelease.localeCompare(pb.prerelease);
}
