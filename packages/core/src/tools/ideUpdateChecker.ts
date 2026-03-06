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
            vscode.commands.registerCommand('lunaide.applyIdeUpdate', () => this.applyPendingUpdate())
        );
    }

    async checkForUpdates(force = false): Promise<void> {
        const lastChecked = this.context.globalState.get<number>(CACHE_KEY, 0);
        if (!force && Date.now() - lastChecked < CACHE_TTL_MS) return;

        try {
            const latest = await getLatestGitHubRelease(IDE_REPO);
            if (!latest) return;

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
        } catch {
            // Silently ignore network errors
        }

        if (!this.timer) {
            this.timer = setInterval(() => { void this.checkForUpdates(); }, CHECK_INTERVAL_MS);
        }
    }

    private async downloadAndInstall(version: string): Promise<void> {
        const appPath = getAppBundlePath();
        if (!appPath) {
            // Non-macOS fallback: open browser
            void vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${IDE_REPO}/releases/latest`));
            return;
        }

        const assetUrl = await findAssetUrl(version);
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
                    await downloadFile(assetUrl, zipPath, (pct) => {
                        progress.report({ increment: pct, message: `${Math.round(pct)}%` });
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
            // Relaunch
            `open "$APP"`,
            // Cleanup
            `rm -rf "$BACKUP" "${updateDir}" "${zipPath}" "${scriptPath}" 2>/dev/null || true`,
        ].join('\n');

        fs.writeFileSync(scriptPath, script, { mode: 0o755 });

        // Spawn the script detached so it survives the app quitting
        const child = spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' });
        child.unref();

        // Quit so the script can replace the .app
        void vscode.commands.executeCommand('workbench.action.quit');
    }

    dispose(): void {
        if (this.timer) clearInterval(this.timer);
        for (const d of this.disposables) d.dispose();
    }
}

/** Derive the macOS .app bundle path from the running Electron binary path. */
function getAppBundlePath(): string | undefined {
    if (process.platform !== 'darwin') return undefined;
    // process.execPath → /path/to/LunaIDE.app/Contents/MacOS/Electron
    const marker = '.app/Contents/';
    const idx = process.execPath.indexOf(marker);
    if (idx === -1) return undefined;
    return process.execPath.slice(0, idx + 4); // up to and including ".app"
}

/** Fetch the release from GitHub and return the download URL for the matching platform asset. */
function findAssetUrl(version: string): Promise<string | undefined> {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';

    return new Promise((resolve) => {
        const options: https.RequestOptions = {
            hostname: 'api.github.com',
            path: `/repos/${IDE_REPO}/releases/latest`,
            headers: { 'User-Agent': 'LunaIDE', Accept: 'application/vnd.github.v3+json' },
            timeout: 10000,
        };

        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    const assets: Array<{ name: string; browser_download_url: string }> = release.assets ?? [];
                    // Prefer exact platform+arch match, fall back to any zip
                    const asset =
                        assets.find(a => a.name.endsWith('.zip') && a.name.toLowerCase().includes(platform) && a.name.toLowerCase().includes(arch)) ??
                        assets.find(a => a.name.endsWith('.zip') && a.name.toLowerCase().includes(platform)) ??
                        assets.find(a => a.name.endsWith('.zip'));
                    resolve(asset?.browser_download_url);
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
function downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const follow = (targetUrl: string) => {
            const parsed = new URL(targetUrl);
            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: { 'User-Agent': 'LunaIDE' },
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
