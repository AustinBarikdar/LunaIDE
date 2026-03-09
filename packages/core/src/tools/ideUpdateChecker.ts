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
            const scriptPath = path.join(os.tmpdir(), `lunaide-updater-${version}.ps1`);
            const backupPath = `${appPath}.bak`;
            const exeName = 'LunaIDE.exe';

            const script = [
                `$ErrorActionPreference = 'Stop'`,
                `$appPath = '${appPath}'`,
                `$updateDir = '${updateDir}'`,
                `$zipPath = '${zipPath}'`,
                `$backupPath = '${backupPath}'`,
                `$exePath = Join-Path -Path $appPath -ChildPath '${exeName}'`,
                ``,
                `# Wait for the main app process to exit`,
                `Start-Sleep -Seconds 3`,
                ``,
                `# Extract the zip file`,
                `New-Item -ItemType Directory -Force -Path $updateDir | Out-Null`,
                `Expand-Archive -Path $zipPath -DestinationPath $updateDir -Force`,
                ``,
                `# Find the extracted root (sometimes zips contain a single root folder)`,
                `$extractedRoot = $updateDir`,
                `$subdirs = Get-ChildItem -Path $updateDir -Directory`,
                `if ($subdirs.Count -eq 1 -and (Get-ChildItem -Path $updateDir -File).Count -eq 0) {`,
                `    $extractedRoot = $subdirs[0].FullName`,
                `}`,
                ``,
                `# Double check the exe exists in the extracted directory`,
                `$extractedExe = Join-Path -Path $extractedRoot -ChildPath '${exeName}'`,
                `if (-not (Test-Path -Path $extractedExe -PathType Leaf)) {`,
                `    # Try to find it anywhere`,
                `    $foundExe = Get-ChildItem -Path $updateDir -Filter '${exeName}' -Recurse | Select-Object -First 1`,
                `    if ($foundExe) {`,
                `        $extractedRoot = $foundExe.DirectoryName`,
                `    } else {`,
                `        Write-Host "Update failed: ${exeName} not found in zip."`,
                `        Exit 1`,
                `    }`,
                `}`,
                ``,
                `# Rename current app path to backup (this works even if some files are locked, as long as the dir isn't)`,
                `if (Test-Path -Path $backupPath) { Remove-Item -Recurse -Force $backupPath -ErrorAction SilentlyContinue }`,
                `Rename-Item -Path $appPath -NewName $backupPath -ErrorAction Stop`,
                ``,
                `# Move the new files into place`,
                `Move-Item -Path $extractedRoot -Destination $appPath -ErrorAction Stop`,
                ``,
                `# Start the newly installed app`,
                `Start-Process -FilePath $exePath`,
                ``,
                `# Clean up`,
                `Remove-Item -Recurse -Force $backupPath -ErrorAction SilentlyContinue`,
                `Remove-Item -Recurse -Force $updateDir -ErrorAction SilentlyContinue`,
                `Remove-Item -Force $zipPath -ErrorAction SilentlyContinue`,
                `Remove-Item -Force $PSCommandPath -ErrorAction SilentlyContinue`
            ].join('\r\n');

            fs.writeFileSync(scriptPath, script);

            const child = spawn('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden',
                '-File', scriptPath
            ], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

        } else if (process.platform === 'darwin') {
            const scriptPath = path.join(os.tmpdir(), `lunaide-updater-${version}.sh`);

            const script = [
                '#!/bin/bash',
                'set -e',
                `BACKUP="${appPath}.bak"`,
                `NEW_APP="${updateDir}/LunaIDE.app"`,
                `APP="${appPath}"`,
                // Wait for the current process to exit
                'sleep 2',
                // Unzip
                `mkdir -p "${updateDir}"`,
                `unzip -o "${zipPath}" -d "${updateDir}" > /dev/null 2>&1`,
                // Find the .app (handle cases where it might be nested one level)
                `if [ ! -d "$NEW_APP" ]; then`,
                `  NEW_APP=$(find "${updateDir}" -maxdepth 2 -name "*.app" | head -1)`,
                `fi`,
                `if [ -z "$NEW_APP" ] || [ ! -d "$NEW_APP" ]; then`,
                `  osascript -e 'display alert "LunaIDE update failed: .app not found in downloaded package."'`,
                `  exit 1`,
                `fi`,
                // Swap: move old aside, copy new in
                `rm -rf "$BACKUP" 2>/dev/null || true`,
                `mv "$APP" "$BACKUP"`,
                `cp -R "$NEW_APP" "$APP"`,
                // Re-codesign (ad-hoc) — required because the binary is patched
                `xattr -cr "$APP" 2>/dev/null || true`,
                `codesign --force --deep --sign - "$APP" 2>/dev/null || true`,
                // Relaunch (use -n to force a new instance in case macOS still sees the old process)
                `sleep 1`,
                `open -n "$APP"`,
                // Cleanup
                `rm -rf "$BACKUP" "${updateDir}" "${zipPath}" "${scriptPath}" 2>/dev/null || true`,
            ].join('\n');

            fs.writeFileSync(scriptPath, script, { mode: 0o755 });

            // Spawn the script detached so it survives the app quitting
            const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
            child.unref();
        } else {
            vscode.window.showErrorMessage('Auto-update is not supported on this platform.');
            return;
        }

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
