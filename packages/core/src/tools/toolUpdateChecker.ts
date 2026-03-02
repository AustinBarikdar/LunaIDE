import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';

export interface ManagedTool {
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

    if (!force && Date.now() - lastChecked < CACHE_TTL_MS) return;

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
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: 'api.github.com',
        path: `/repos/${repo}/releases/latest`,
        headers: { 'User-Agent': 'LunaIDE', Accept: 'application/vnd.github.v3+json' },
        timeout: 10000,
      };

      const req = https.get(options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
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
              this.readJsonResponse(res2).then(resolve).catch(() => resolve(undefined));
            });
            req2.on('error', () => resolve(undefined));
            return;
          }
        }
        this.readJsonResponse(res).then(resolve).catch(() => resolve(undefined));
      });

      req.on('error', () => resolve(undefined));
      req.on('timeout', () => { req.destroy(); resolve(undefined); });
    });
  }

  private readJsonResponse(res: import('http').IncomingMessage): Promise<string | undefined> {
    return new Promise((resolve) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tag: string = json.tag_name ?? '';
          resolve(tag.replace(/^v/, ''));
        } catch {
          resolve(undefined);
        }
      });
      res.on('error', () => resolve(undefined));
    });
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

  private runAftmanUpdate(tool: ManagedTool, version: string): void {
    const cmd = 'aftman';
    const args = ['add', '--global', `${tool.repo}@${version}`];

    execFile(cmd, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        vscode.window.showErrorMessage(
          `Failed to update ${tool.displayName}: ${error.message}`
        );
        return;
      }

      this.hideStatusBarItem(tool.id);
      vscode.window.showInformationMessage(
        `${tool.displayName} updated to v${version}.`
      );

      // Reset cache so next check sees the new version
      void this.context.globalState.update(`lunaide.toolUpdate.${tool.id}.lastChecked`, 0);
    });
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    for (const item of this.statusBarItems.values()) item.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

function getInstalledRojoVersion(): string | undefined {
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

function getInstalledLuauLspVersion(): string | undefined {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const storageDir = path.join(home, '.aftman', 'tool-storage', 'luau-lsp');

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

/** Compare two semver strings (ignores pre-release suffixes). Returns >0 if a > b. */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.replace(/-.*$/, '').split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
