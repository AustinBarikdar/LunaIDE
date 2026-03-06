import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';

interface ManagedTool {
  id: string;
  repo: string;
  displayName: string;
}

const MANAGED_TOOLS: ManagedTool[] = [
  { id: 'rojo', repo: 'rojo-rbx/rojo', displayName: 'Rojo' },
  { id: 'luau-lsp', repo: 'JohnnyMorganz/luau-lsp', displayName: 'Luau LSP' },
];

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class ToolUpdateChecker implements vscode.Disposable {
  private statusBarItems = new Map<string, vscode.StatusBarItem>();
  private availableUpdates = new Map<string, { tool: ManagedTool, installed: string, latest: string }>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposables: vscode.Disposable[] = [];
  private isFirstCheck = true;


  constructor(private readonly context: vscode.ExtensionContext) {
    this.updateContext();
    this.disposables.push(
      vscode.commands.registerCommand('lunaide.updateTools', () => this.showUpdateMenu()),
      vscode.commands.registerCommand('lunaide.checkForUpdates', () => this.checkForUpdates(true))
    );
  }

  async checkForUpdates(force = false): Promise<void> {
    if (force) {
      vscode.window.showInformationMessage('Checking for tool updates...');
    }

    for (const tool of MANAGED_TOOLS) {
      await this.checkTool(tool, force);
    }

    if (!this.timer) {
      this.timer = setInterval(() => {
        for (const tool of MANAGED_TOOLS) {
          void this.checkTool(tool);
        }
      }, CHECK_INTERVAL_MS);
    }
  }

  private async checkTool(tool: ManagedTool, force = false): Promise<void> {
    const cacheKey = `lunaide.toolUpdate.${tool.id}.lastChecked`;
    const lastChecked = this.context.globalState.get<number>(cacheKey, 0);

    // Bypass cache for the very first check after launch (isFirstCheck)
    if (!force && !this.isFirstCheck && Date.now() - lastChecked < CACHE_TTL_MS) return;
    this.isFirstCheck = false;

    try {
      const installed = this.getInstalledVersion(tool);
      if (!installed) return;

      const latest = await this.getLatestGitHubRelease(tool.repo);
      if (!latest) return;

      await this.context.globalState.update(cacheKey, Date.now());

      if (compareSemver(latest, installed) > 0) {
        this.showUpdateAvailable(tool, installed, latest);
      } else {
        this.hideStatusBarItem(tool.id);
      }
    } catch {
      // Silently ignore — network errors, missing dirs, etc.
    }
  }

  private getInstalledVersion(tool: ManagedTool): string | undefined {
    if (tool.id === 'rojo') return getInstalledRojoVersion();
    if (tool.id === 'luau-lsp') return getInstalledLuauLspVersion();
    return undefined;
  }

  private getLatestGitHubRelease(repo: string): Promise<string | undefined> {
    return getLatestGitHubRelease(repo);
  }

  private showUpdateAvailable(tool: ManagedTool, installed: string, latest: string): void {
    const commandId = `lunaide.toolUpdate.${tool.id}`;

    this.availableUpdates.set(tool.id, { tool, installed, latest });
    this.updateContext();

    // Register the command if not already registered
    if (!this.statusBarItems.has(tool.id)) {
      const disposable = vscode.commands.registerCommand(commandId, () => {
        this.promptUpdate(tool, installed, latest);
      });
      this.disposables.push(disposable);
    }

    let item = this.statusBarItems.get(tool.id);
    if (!item) {
      item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
      this.statusBarItems.set(tool.id, item);
    }

    item.text = `$(cloud-download) ${tool.displayName} v${latest}`;
    item.tooltip = `${tool.displayName} ${latest} is available (installed: ${installed})`;
    item.command = commandId;
    item.show();
  }

  private hideStatusBarItem(toolId: string): void {
    const item = this.statusBarItems.get(toolId);
    if (item) item.hide();

    this.availableUpdates.delete(toolId);
    this.updateContext();
  }

  private updateContext(): void {
    const hasUpdates = this.availableUpdates.size > 0;
    void vscode.commands.executeCommand('setContext', 'lunaide.updateAvailable', hasUpdates === true);
  }

  private showUpdateMenu(): void {
    if (this.availableUpdates.size === 0) {
      vscode.window.showInformationMessage('No updates available.');
      return;
    }

    const items = Array.from(this.availableUpdates.values()).map(u => ({
      label: `$(cloud-download) Update ${u.tool.displayName}`,
      description: `v${u.latest} (current: v${u.installed})`,
      toolId: u.tool.id
    }));

    void vscode.window.showQuickPick(items, { placeHolder: 'Select a tool to update' }).then(selected => {
      if (selected) {
        const update = this.availableUpdates.get(selected.toolId);
        if (update) {
          this.promptUpdate(update.tool, update.installed, update.latest);
        }
      }
    });
  }

  private promptUpdate(tool: ManagedTool, installed: string, latest: string): void {
    const hasAftman = isAftmanInstalled();
    const actions = hasAftman ? ['Update', 'Dismiss'] : ['Install aftman', 'Dismiss'];

    void vscode.window
      .showInformationMessage(
        `${tool.displayName} ${latest} is available (you have ${installed}).`,
        ...actions
      )
      .then((choice) => {
        if (choice === 'Update') {
          this.runAftmanUpdate(tool, latest);
        } else if (choice === 'Install aftman') {
          void vscode.env.openExternal(vscode.Uri.parse('https://github.com/LPGhatguy/aftman'));
        } else {
          this.hideStatusBarItem(tool.id);
        }
      });
  }

  private async runAftmanUpdate(tool: ManagedTool, version: string): Promise<void> {
    const addCmd = 'aftman';
    const addArgs = ['add', '--global', `${tool.repo}@${version}`];

    execFile(addCmd, addArgs, { timeout: 60000 }, (addError) => {
      if (addError) {
        vscode.window.showErrorMessage(
          `Failed to add ${tool.displayName} v${version} to aftman: ${addError.message}`
        );
        return;
      }

      // After adding, we MUST run 'aftman install' to actually download the binary.
      execFile('aftman', ['install'], { timeout: 120000 }, async (installError) => {
        if (installError) {
          vscode.window.showErrorMessage(
            `Failed to install ${tool.displayName} via aftman: ${installError.message}`
          );
          return;
        }

        // Verify the binary exists. Aftman sometimes fails to download silently.
        const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
        const binaryPath = path.join(home, '.aftman', 'tool-storage', tool.repo, version, tool.id);

        if (!fs.existsSync(binaryPath)) {
          // Manual fallback if Aftman failed to download
          if (tool.id === 'rojo') {
            const success = await this.manuallyInstallRojo(version);
            if (!success) return;
          } else {
            vscode.window.showErrorMessage(`Aftman failed to download ${tool.displayName} v${version}. Please try manual installation.`);
            return;
          }
        }

        this.hideStatusBarItem(tool.id);

        if (tool.id === 'rojo') {
          // Delete existing plugin files before installing new ones
          const pluginsDir = path.join(home, 'Documents', 'Roblox', 'Plugins');
          ['Rojo.rbxm', 'Rojo.rbxmx'].forEach(file => {
            const p = path.join(pluginsDir, file);
            if (fs.existsSync(p)) {
              try { fs.unlinkSync(p); } catch { /* ignore */ }
            }
          });

          execFile('rojo', ['plugin', 'install'], { timeout: 30000 }, (pluginErr) => {
            if (pluginErr) {
              vscode.window.showWarningMessage(
                `${tool.displayName} CLI updated to v${version}, but Studio plugin install failed: ${pluginErr.message}. You may need to run 'rojo plugin install' manually.`
              );
            } else {
              vscode.window.showInformationMessage(
                `${tool.displayName} updated to v${version} and Studio plugin installed successfully.`
              );
            }
            void this.context.globalState.update(`lunaide.toolUpdate.${tool.id}.lastChecked`, 0);
          });
        } else {

          vscode.window.showInformationMessage(`${tool.displayName} updated to v${version}.`);
          void this.context.globalState.update(`lunaide.toolUpdate.${tool.id}.lastChecked`, 0);
        }
      });
    });
  }

  private async manuallyInstallRojo(version: string): Promise<boolean> {
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Downloading Rojo v${version}...`,
      cancellable: false
    }, async (progress) => {
      const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
      const storageDir = path.join(home, '.aftman', 'tool-storage', 'rojo-rbx', 'rojo', version);
      const tempDir = path.join(home, '.aftman', 'temp-download');

      try {
        // 1. Delete old/corrupt directory if it exists (as requested by user)
        if (fs.existsSync(storageDir)) {
          fs.rmSync(storageDir, { recursive: true, force: true });
        }

        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
        const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
        const url = `https://github.com/rojo-rbx/rojo/releases/download/v${version}/rojo-${version}-${platform}-${arch}.zip`;
        const zipPath = path.join(tempDir, 'rojo.zip');

        // Simple download helper
        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(zipPath);
          https.get(url, (response) => {
            if (response.statusCode !== 200 && response.statusCode !== 302) {
              reject(new Error(`Failed to download Rojo: ${response.statusCode}`));
              return;
            }
            // Handle redirects
            if (response.statusCode === 302 && response.headers.location) {
              https.get(response.headers.location, (res2) => {
                res2.pipe(file);
                file.on('finish', () => { file.close(); resolve(true); });
              }).on('error', reject);
            } else {
              response.pipe(file);
              file.on('finish', () => { file.close(); resolve(true); });
            }
          }).on('error', reject);
        });

        // Use shell unzip to be simple
        await new Promise((resolve, reject) => {
          execFile('unzip', ['-o', zipPath, '-d', tempDir], (err) => {
            if (err) reject(err); else resolve(true);
          });
        });

        if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

        const extractedRojo = path.join(tempDir, 'rojo');
        if (fs.existsSync(extractedRojo)) {
          fs.renameSync(extractedRojo, path.join(storageDir, 'rojo'));
          fs.chmodSync(path.join(storageDir, 'rojo'), 0o755);
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Manual Rojo installation failed: ${message}`);
        return false;
      }
    });
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    for (const item of this.statusBarItems.values()) item.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

function readJsonResponse(res: import('http').IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    let data = '';
    res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        // If it's an array (from /releases), pick the first one
        if (Array.isArray(json) && json.length > 0) {
          const tag: string = json[0].tag_name ?? '';
          resolve(tag.replace(/^v/, ''));
        } else {
          // It's a single release object (from /releases/latest)
          const tag: string = json.tag_name ?? '';
          resolve(tag.replace(/^v/, ''));
        }
      } catch {
        resolve(undefined);
      }
    });
    res.on('error', () => resolve(undefined));
  });
}

export function getLatestGitHubRelease(repo: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    // For Rojo, we want to capture pre-releases (e.g., 7.7.0-rc.1), so we fetch all releases.
    // For others, latest is usually fine, but fetching /releases works for both to get the absolute newest tag.
    const path = repo === 'rojo-rbx/rojo' ? `/repos/${repo}/releases` : `/repos/${repo}/releases/latest`;

    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path,
      headers: { 'User-Agent': 'LunaIDE', Accept: 'application/vnd.github.v3+json' },
      timeout: 10000,
    };

    const req = https.get(options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const location = res.headers.location;
        if (location) {
          const url = new URL(location);
          const redirectOpts: https.RequestOptions = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: options.headers,
            timeout: 10000,
          };
          const req2 = https.get(redirectOpts, (res2) => {
            readJsonResponse(res2).then(resolve).catch(() => resolve(undefined));
          });
          req2.on('error', () => resolve(undefined));
          return;
        }
      }
      readJsonResponse(res).then(resolve).catch(() => resolve(undefined));
    });

    req.on('error', () => resolve(undefined));
    req.on('timeout', () => { req.destroy(); resolve(undefined); });
  });
}

export function getInstalledRojoVersion(): string | undefined {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const storageDir = path.join(home, '.aftman', 'tool-storage', 'rojo-rbx', 'rojo');

  let entries: string[];
  try {
    entries = fs.readdirSync(storageDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return undefined;
  }

  if (entries.length === 0) return undefined;

  // Pick the highest semver version folder
  return entries.sort((a, b) => compareSemver(b, a))[0];
}

export function getInstalledLuauLspVersion(): string | undefined {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const storageDir = path.join(home, '.aftman', 'tool-storage', 'JohnnyMorganz', 'luau-lsp');

  let entries: string[];
  try {
    entries = fs.readdirSync(storageDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return undefined;
  }

  if (entries.length === 0) return undefined;

  // Pick the highest semver version folder
  return entries.sort((a, b) => compareSemver(b, a))[0];
}

function isAftmanInstalled(): boolean {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return fs.existsSync(path.join(home, '.aftman'));
}

/** Compare two semver strings including prerelease tags. Returns >0 if a > b. */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) return { major: 0, minor: 0, patch: 0, prerelease: '' };
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] || ''
    };
  };

  const pa = parse(a);
  const pb = parse(b);

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  // Prerelease logic: a release *without* a prerelease tag is always > one *with* a prerelease tag.
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  if (pa.prerelease === pb.prerelease) return 0;

  // If both have prerelease tags, compare them lexicographically (basic fallback)
  return pa.prerelease.localeCompare(pb.prerelease);
}
