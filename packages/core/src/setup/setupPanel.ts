import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { AgentConnector } from '../mcp/agentConnector.js';
import { ExtensionUpdater, MANAGED_EXTENSIONS, ManagedExtension } from '../extensions/extensionUpdater.js';

interface SetupItem {
    id: string;
    label: string;
    status: 'ok' | 'error' | 'warning';
    detail: string;
    actionLabel?: string;
    actionCommand?: string;
}

interface AgentItem {
    id: string;
    label: string;
    installed: boolean;
    configured: boolean;
    configPath: string;
}

interface ExtensionStatus {
    ext: ManagedExtension;
    installedVersion: string | null;
    latestVersion: string | null | 'checking';
}

export class SetupPanel implements vscode.Disposable {
    public static currentPanel: SetupPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private readonly _context: vscode.ExtensionContext;
    private _disposed = false;

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._context = context;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._refresh();

        this._panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'installPlugin':
                    await this._installPlugin();
                    break;
                case 'importRbxm':
                    await this._importRbxm();
                    break;
                case 'installAftman':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/LPGhatguy/aftman#installation'));
                    break;
                case 'installRojoPlugin':
                    await this._installRojoPlugin();
                    break;
                case 'enableHttp':
                    vscode.env.openExternal(vscode.Uri.parse('https://create.roblox.com/docs/cloud/open-cloud/usage-place-publishing#configure-api-access'));
                    break;
                case 'installShellCommand':
                    await this._installShellCommand();
                    break;
                case 'configureAgent':
                    await this._configureAgent(msg.agentId);
                    break;
                case 'openAgentConfig':
                    await this._openAgentConfig(msg.agentId);
                    break;
                case 'updateExtension':
                    await this._updateExtension(msg.extId);
                    break;
                case 'toggleScreenCapture':
                    await this._toggleScreenCapture();
                    break;
                case 'refresh':
                    this._refresh();
                    break;
                case 'dismiss':
                    await this._context.globalState.update('lunaide.setupDismissed', true);
                    this._panel.dispose();
                    break;
            }
        }, null, this._disposables);
    }

    public static async createOrShow(context: vscode.ExtensionContext) {
        if (SetupPanel.currentPanel) {
            SetupPanel.currentPanel._panel.reveal();
            SetupPanel.currentPanel._refresh();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'lunaIdeSetup',
            'LunaIDE Setup',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        SetupPanel.currentPanel = new SetupPanel(panel, context);
    }

    public static async checkSetup(): Promise<boolean> {
        const items = await SetupPanel._gatherItems();
        return items.some((i) => i.status === 'error');
    }

    private _getWorkspacePath(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    // ── Write agent config ───────────────────────────────────────────────────

    private async _configureAgent(agentId: string): Promise<void> {
        try {
            await AgentConnector.configureAgent(agentId, this._context.extensionPath, this._getWorkspacePath());
            vscode.window.showInformationMessage(
                `LunaIDE MCP server configured for ${this._agentLabel(agentId)}. Restart the agent to pick it up.`
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to write config: ${message}`);
        }

        this._refresh();
    }

    private async _openAgentConfig(agentId: string): Promise<void> {
        const cfgPath = AgentConnector.agentConfigPath(agentId, this._getWorkspacePath());
        if (!cfgPath || !fs.existsSync(cfgPath)) return;
        const doc = await vscode.workspace.openTextDocument(cfgPath);
        await vscode.window.showTextDocument(doc);
    }

    private _agentLabel(agentId: string): string {
        switch (agentId) {
            case 'claudecode': return 'Claude Code';
            case 'codexcli': return 'Codex CLI';
            default: return agentId;
        }
    }

    // ── Extension update ─────────────────────────────────────────────────────

    private async _updateExtension(extId: string): Promise<void> {
        const ext = MANAGED_EXTENSIONS.find(e => e.id === extId);
        if (!ext) return;

        const latestVersion = await ExtensionUpdater.getLatestVersion(ext);
        if (!latestVersion) {
            vscode.window.showErrorMessage(`Failed to fetch latest version for ${ext.displayName}.`);
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${ext.displayName} to v${latestVersion}…`,
            cancellable: false,
        }, async () => {
            try {
                await ExtensionUpdater.update(ext, latestVersion);
                vscode.window.showInformationMessage(
                    `${ext.displayName} updated to v${latestVersion}. Reload LunaIDE to apply.`
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Failed to update ${ext.displayName}: ${message}`);
            }
        });

        this._refresh();
    }

    // ── Screen capture consent ───────────────────────────────────────────────

    private async _toggleScreenCapture(): Promise<void> {
        const config = vscode.workspace.getConfiguration('robloxIde');
        const current = config.get<boolean>('enableScreenCapture', false);
        await config.update('enableScreenCapture', !current, vscode.ConfigurationTarget.Global);
        this._refresh();
    }

    // ── Gather data ──────────────────────────────────────────────────────────

    private _refresh() {
        void this._doRefresh();
    }

    private async _doRefresh(): Promise<void> {
        const [items, agents] = await Promise.all([
            SetupPanel._gatherItems(),
            Promise.resolve(this._gatherAgents()),
        ]);

        const screenCaptureEnabled = vscode.workspace.getConfiguration('robloxIde').get<boolean>('enableScreenCapture', false);

        // Get installed versions synchronously; show "Checking..." for latest
        const extStatuses: ExtensionStatus[] = MANAGED_EXTENSIONS.map(ext => ({
            ext,
            installedVersion: ExtensionUpdater.getInstalledVersion(ext),
            latestVersion: 'checking' as const,
        }));

        if (this._disposed) return;
        this._panel.webview.html = this._getHtml(items, agents, extStatuses, screenCaptureEnabled);

        // Async-fetch latest versions, then re-render
        const latestVersions = await Promise.all(
            MANAGED_EXTENSIONS.map(ext => ExtensionUpdater.getLatestVersion(ext))
        );

        const updatedStatuses: ExtensionStatus[] = MANAGED_EXTENSIONS.map((ext, i) => ({
            ext,
            installedVersion: ExtensionUpdater.getInstalledVersion(ext),
            latestVersion: latestVersions[i],
        }));

        if (this._disposed) return;
        this._panel.webview.html = this._getHtml(items, agents, updatedStatuses, screenCaptureEnabled);
    }

    private _gatherAgents(): AgentItem[] {
        const agents: Array<{ id: string; label: string }> = [
            { id: 'claudecode', label: 'Claude Code' },
            { id: 'codexcli', label: 'Codex CLI' },
        ];

        const workspace = this._getWorkspacePath();
        return agents.map(({ id, label }) => ({
            id,
            label,
            installed: AgentConnector.isAgentInstalled(id),
            configured: AgentConnector.isAgentConfigured(id, workspace),
            configPath: AgentConnector.agentConfigPath(id, workspace),
        }));
    }

    private static async _gatherItems(): Promise<SetupItem[]> {
        const home = os.homedir();
        const isWindows = os.platform() === 'win32';
        const items: SetupItem[] = [];

        // 0. lunaide shell command in PATH
        let lunaideInPath = false;
        const lunaideCmd = isWindows ? 'lunaide.cmd' : 'lunaide';
        const whichCmd = isWindows ? 'where' : 'which';
        try {
            const result = execSync(`${whichCmd} ${lunaideCmd}`, { encoding: 'utf-8' }).trim();
            lunaideInPath = result.length > 0;
        } catch { /* not in PATH */ }
        // Also check ~/.local/bin directly
        if (!lunaideInPath) {
            const localBin = path.join(home, '.local', 'bin', lunaideCmd);
            const usrLocalBin = path.join('/usr/local/bin', lunaideCmd);
            const winAppLocalAppData = isWindows ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs', 'LunaIDE', 'bin', lunaideCmd) : '';
            lunaideInPath = fs.existsSync(localBin) || (!isWindows && fs.existsSync(usrLocalBin)) || (isWindows && fs.existsSync(winAppLocalAppData));
        }
        items.push({
            id: 'shellcmd',
            label: "'lunaide' command in PATH",
            status: lunaideInPath ? 'ok' : 'warning',
            detail: lunaideInPath ? 'lunaide command available in terminal' : 'Not installed — you cannot open LunaIDE from the terminal.',
            actionLabel: lunaideInPath ? 'Reinstall' : "Install 'lunaide' command",
            actionCommand: 'installShellCommand',
        });

        // 1. Aftman
        const aftmanExe = isWindows ? 'aftman.exe' : 'aftman';
        const aftmanBin = path.join(home, '.aftman', 'bin', aftmanExe);
        const aftmanOk = fs.existsSync(aftmanBin);
        items.push({
            id: 'aftman',
            label: 'Aftman toolchain manager',
            status: aftmanOk ? 'ok' : 'warning',
            detail: aftmanOk ? aftmanBin : 'Not found — needed to manage Rojo versions.',
            actionLabel: aftmanOk ? undefined : 'Install Aftman',
            actionCommand: aftmanOk ? undefined : 'installAftman',
        });

        // 2. Rojo
        const rojoExe = isWindows ? 'rojo.exe' : 'rojo';
        const aftmanStore = path.join(home, '.aftman', 'tool-storage', 'rojo-rbx', 'rojo');
        let rojoBin = '';
        let rojoSource = '';
        if (fs.existsSync(aftmanStore)) {
            const versions = fs.readdirSync(aftmanStore).sort().reverse();
            for (const ver of versions) {
                const bin = path.join(aftmanStore, ver, rojoExe);
                if (fs.existsSync(bin)) { rojoBin = bin; rojoSource = `aftman (${ver})`; break; }
            }
        }
        if (!rojoBin && fs.existsSync(path.join(home, '.foreman', 'bin', rojoExe))) {
            rojoBin = path.join(home, '.foreman', 'bin', rojoExe); rojoSource = 'foreman';
        }
        if (!rojoBin && fs.existsSync(path.join(home, '.cargo', 'bin', rojoExe))) {
            rojoBin = path.join(home, '.cargo', 'bin', rojoExe); rojoSource = 'cargo';
        }
        if (!rojoBin) {
            try {
                const p = execSync(`${whichCmd} ${rojoExe}`, { encoding: 'utf-8' }).trim().split('\n')[0];
                if (p) { rojoBin = p; rojoSource = 'PATH'; }
            } catch { /* not found */ }
        }
        items.push({
            id: 'rojo',
            label: 'Rojo sync tool',
            status: rojoBin ? 'ok' : 'error',
            detail: rojoBin ? `Found via ${rojoSource}: ${rojoBin}` : 'Not found — run: aftman add rojo-rbx/rojo',
            actionLabel: rojoBin ? 'Reinstall Plugin' : 'Install Aftman',
            actionCommand: rojoBin ? 'installRojoPlugin' : 'installAftman',
        });

        // 3. Studio plugin
        const pluginsDir = isWindows 
            ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Roblox', 'Plugins')
            : path.join(home, 'Documents', 'Roblox', 'Plugins');
        const pluginPath = path.join(pluginsDir, 'LunaIDE.rbxmx');
        const pluginOk = fs.existsSync(pluginPath);
        items.push({
            id: 'plugin',
            label: 'Roblox Studio plugin',
            status: pluginOk ? 'ok' : 'error',
            detail: pluginOk ? pluginPath : 'Not installed — Studio cannot connect to LunaIDE.',
            actionLabel: pluginOk ? 'Reinstall' : 'Install Plugin',
            actionCommand: 'installPlugin',
        });

        // 3.5 Specific plugin importer (rbxm)
        items.push({
            id: 'importPlugin',
            label: 'Import Local Plugin (.rbxm)',
            status: 'ok',
            detail: 'Select any .rbxm/.rbxmx file to copy directly to your Studio Plugins folder.',
            actionLabel: 'Import Plugin',
            actionCommand: 'importRbxm',
        });

        // 4. HTTP requests
        items.push({
            id: 'http',
            label: 'Studio HTTP requests',
            status: 'warning',
            detail: 'Enable in Studio: Game Settings → Security → Allow HTTP Requests',
            actionLabel: 'How to enable',
            actionCommand: 'enableHttp',
        });

        return items;
    }

    // ── Install shell command ────────────────────────────────────────────────

    private async _installShellCommand(): Promise<void> {
        const isWindows = os.platform() === 'win32';
        const home = os.homedir();
        
        if (isWindows) {
            void vscode.window.showInformationMessage(
                `On Windows, please add the LunaIDE "bin" folder to your PATH environment variable manually.`, 
                'Copy path to clipboard'
            ).then((choice) => {
                if (choice === 'Copy path to clipboard') {
                    const setupDir = path.dirname(process.execPath);
                    const binDir = path.join(setupDir, 'bin');
                    vscode.env.clipboard.writeText(binDir);
                }
            });
            return;
        }

        const appBin = path.join(home, 'LunaIDE-dist', 'LunaIDE.app', 'Contents', 'Resources', 'app', 'bin', 'codium');
        const linkTargets = ['/usr/local/bin/lunaide', path.join(home, '.local', 'bin', 'lunaide')];

        if (!fs.existsSync(appBin)) {
            vscode.window.showErrorMessage('LunaIDE app not found at ~/LunaIDE-dist/LunaIDE.app. Run prepare.sh first.');
            return;
        }

        for (const linkPath of linkTargets) {
            try {
                fs.mkdirSync(path.dirname(linkPath), { recursive: true });
                if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
                fs.symlinkSync(appBin, linkPath);
                vscode.window.showInformationMessage(
                    `Installed: ${linkPath} — Open a new terminal and type "lunaide ." to open a project.`
                );
                this._refresh();
                return;
            } catch {
                // try next location
            }
        }

        // Both failed — show manual instructions
        void vscode.window.showErrorMessage(
            `Could not write to /usr/local/bin or ~/.local/bin. Add manually:\\n  ln -s "${appBin}" /usr/local/bin/lunaide`,
            'Copy command'
        ).then((choice) => {
            if (choice === 'Copy command') {
                vscode.env.clipboard.writeText(`ln -sf "${appBin}" /usr/local/bin/lunaide`);
            }
        });
    }

    // ── Install plugin ───────────────────────────────────────────────────────

    private async _installRojoPlugin(): Promise<void> {
        const isWindows = os.platform() === 'win32';
        const home = os.homedir();
        const pluginsDir = isWindows 
            ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Roblox', 'Plugins')
            : path.join(home, 'Documents', 'Roblox', 'Plugins');

        try {
            fs.mkdirSync(pluginsDir, { recursive: true });
            const bundledPlugin = path.join(this._context.extensionPath, 'Rojo.rbxm');
            if (fs.existsSync(bundledPlugin)) {
                fs.copyFileSync(bundledPlugin, path.join(pluginsDir, 'Rojo.rbxm'));
                vscode.window.showInformationMessage('Rojo Roblox Studio plugin installed successfully!');
            } else {
                vscode.window.showErrorMessage('Bundled Rojo.rbxm not found. Please run prepare.sh to rebuild LunaIDE.');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to install Rojo plugin: ${message}`);
        }
    }

    private async _installPlugin(): Promise<void> {
        const isWindows = os.platform() === 'win32';
        const home = os.homedir();
        const pluginsDir = isWindows 
            ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Roblox', 'Plugins')
            : path.join(home, 'Documents', 'Roblox', 'Plugins');

        try {
            fs.mkdirSync(pluginsDir, { recursive: true });

            // Use the pre-built plugins bundled into the extension by prepare.sh
            const requiredPlugins = ['LunaIDE.rbxmx', 'Rojo.rbxm'];
            let installedCount = 0;

            for (const pluginName of requiredPlugins) {
                const bundledPlugin = path.join(this._context.extensionPath, pluginName);
                if (fs.existsSync(bundledPlugin)) {
                    fs.copyFileSync(bundledPlugin, path.join(pluginsDir, pluginName));
                    installedCount++;
                }
            }

            if (installedCount === requiredPlugins.length) {
                vscode.window.showInformationMessage('Studio plugins installed! Restart Roblox Studio to load them.');
            } else if (installedCount > 0) {
                vscode.window.showWarningMessage(`Only installed ${installedCount}/${requiredPlugins.length} plugins. Run prepare.sh to rebuild LunaIDE.`);
            } else {
                vscode.window.showErrorMessage('Bundled plugins not found. Please run prepare.sh to rebuild LunaIDE.');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Plugin install failed: ${message}`);
        }

        this._refresh();
    }

    // ── Import Arbitrary Plugin ──────────────────────────────────────────────

    private async _importRbxm(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import Plugin',
            filters: { 'Roblox Plugins': ['rbxm', 'rbxmx'] }
        });
        if (!uris || uris.length === 0) return;

        const src = uris[0].fsPath;
        const filename = path.basename(src);
        const isWindows = os.platform() === 'win32';
        const home = os.homedir();
        const pluginsDir = isWindows 
            ? path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Roblox', 'Plugins')
            : path.join(home, 'Documents', 'Roblox', 'Plugins');
        const pluginsOut = path.join(pluginsDir, filename);

        try {
            fs.mkdirSync(path.dirname(pluginsOut), { recursive: true });
            fs.copyFileSync(src, pluginsOut);
            vscode.window.showInformationMessage(`Plugin ${filename} installed to Studio Plugins!`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to import plugin: ${message}`);
        }
    }

    // ── HTML ─────────────────────────────────────────────────────────────────

    private _getHtml(items: SetupItem[], agents: AgentItem[], extStatuses: ExtensionStatus[], screenCaptureEnabled: boolean): string {
        const requirementRows = items.map((item) => {
            const icon = item.status === 'ok'
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ec9b0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                : item.status === 'error'
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f14c4c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cca700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

            const actionBtn = item.actionCommand ? `
                <button class="action-btn" onclick="send('${escapeHtml(item.actionCommand)}')">${escapeHtml(item.actionLabel ?? '')}</button>
            ` : '';

            return `
            <div class="setup-row status-${item.status}">
                <div class="row-icon">${icon}</div>
                <div class="row-body">
                    <div class="row-label">${escapeHtml(item.label)}</div>
                    <div class="row-detail">${escapeHtml(item.detail)}</div>
                </div>
                ${actionBtn}
            </div>`;
        }).join('');

        const agentRows = agents.map((agent) => {
            const statusDot = agent.configured
                ? `<span class="agent-badge badge-ok">Connected</span>`
                : agent.installed
                    ? `<span class="agent-badge badge-idle">Not configured</span>`
                    : `<span class="agent-badge badge-dim">Not installed</span>`;

            const primaryBtn = `<button class="action-btn${agent.configured ? ' action-btn-secondary' : ''}"
                onclick="send('configureAgent','${escapeHtml(agent.id)}')">${agent.configured ? 'Reconfigure' : 'Configure'}</button>`;

            const openBtn = agent.configured ? `
                <button class="action-btn action-btn-ghost" onclick="send('openAgentConfig','${escapeHtml(agent.id)}')">Open config</button>
            ` : '';

            return `
            <div class="agent-row${!agent.installed ? ' agent-dim' : ''}">
                <div class="agent-info">
                    <div class="agent-label">${escapeHtml(agent.label)}</div>
                    ${statusDot}
                </div>
                <div class="agent-actions">
                    ${openBtn}
                    ${primaryBtn}
                </div>
            </div>`;
        }).join('');

        const extensionRows = extStatuses.map((status) => {
            const { ext, installedVersion, latestVersion } = status;

            const installedLabel = installedVersion ? `v${installedVersion}` : 'Not installed';

            let badge: string;
            let updateBtn = '';

            if (latestVersion === 'checking') {
                badge = `<span class="agent-badge badge-dim">Checking…</span>`;
            } else if (!installedVersion) {
                badge = `<span class="agent-badge badge-dim">Not installed</span>`;
            } else if (!latestVersion) {
                badge = `<span class="agent-badge badge-dim">Check failed</span>`;
            } else if (installedVersion === latestVersion) {
                badge = `<span class="agent-badge badge-ok">Up to date</span>`;
            } else {
                badge = `<span class="agent-badge badge-warn">Update available</span>`;
                updateBtn = `<button class="action-btn" onclick="updateExt('${escapeHtml(ext.id)}')">Update to v${escapeHtml(latestVersion)}</button>`;
            }

            const versionInfo = latestVersion && latestVersion !== 'checking'
                ? `${installedLabel} → latest v${latestVersion}`
                : installedLabel;

            return `
            <div class="agent-row">
                <div class="agent-info">
                    <div class="agent-label">${escapeHtml(ext.displayName)}</div>
                    <div class="ext-version">${escapeHtml(versionInfo)}</div>
                </div>
                <div class="agent-actions">
                    ${badge}
                    ${updateBtn}
                </div>
            </div>`;
        }).join('');

        const allOk = items.every((i) => i.status !== 'error');
        const statusBanner = allOk
            ? `<div class="banner banner-ok">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                All requirements met — LunaIDE is ready.
               </div>`
            : `<div class="banner banner-warn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Some steps need attention before LunaIDE works fully.
               </div>`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LunaIDE Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: 13px;
    padding: 48px 56px;
    max-width: 700px;
    animation: fadeIn 0.2s ease forwards;
    opacity: 0;
  }
  @keyframes fadeIn { to { opacity: 1; } }

  .header { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
  .header h1 { font-size: 22px; font-weight: 600; letter-spacing: 0.01em; margin-bottom: 4px; }
  .header p { font-size: 12.5px; color: var(--vscode-descriptionForeground); }

  .banner {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-radius: 8px; font-size: 12.5px; margin-bottom: 28px;
  }
  .banner-ok  { background: rgba(78,201,176,.1); border: 1px solid rgba(78,201,176,.3); color: #4ec9b0; }
  .banner-warn{ background: rgba(241,76,76,.08); border: 1px solid rgba(241,76,76,.25); color: #f14c4c; }

  .section-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 12px;
  }

  /* ── Requirements ── */
  .setup-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 36px; }
  .setup-row {
    display: flex; align-items: center; gap: 14px; padding: 13px 16px;
    border-radius: 10px;
    background: var(--vscode-welcomePage-tileBackground, rgba(255,255,255,.03));
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,.07));
  }
  .setup-row.status-error   { border-color: rgba(241,76,76,.35); }
  .setup-row.status-warning { border-color: rgba(204,167,0,.3); }
  .setup-row.status-ok      { border-color: rgba(78,201,176,.25); }
  .row-icon { flex-shrink: 0; display: flex; align-items: center; }
  .row-body { flex: 1; min-width: 0; }
  .row-label { font-size: 13px; font-weight: 500; margin-bottom: 3px; }
  .row-detail {
    font-size: 11.5px; color: var(--vscode-descriptionForeground);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  /* ── Agents + Extensions (shared layout) ── */
  .agent-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; }
  .agent-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-radius: 10px;
    background: var(--vscode-welcomePage-tileBackground, rgba(255,255,255,.03));
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,.07));
    gap: 16px;
  }
  .agent-row.agent-dim { opacity: 0.5; }
  .agent-info { display: flex; align-items: center; gap: 12px; }
  .agent-label { font-size: 13px; font-weight: 500; }
  .ext-version {
    font-size: 11.5px; color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .agent-badge {
    font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 500;
  }
  .badge-ok   { background: rgba(78,201,176,.15); color: #4ec9b0; border: 1px solid rgba(78,201,176,.3); }
  .badge-idle { background: rgba(255,255,255,.05); color: var(--vscode-descriptionForeground); border: 1px solid rgba(255,255,255,.1); }
  .badge-dim  { background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid rgba(255,255,255,.07); }
  .badge-warn { background: rgba(204,167,0,.15); color: #cca700; border: 1px solid rgba(204,167,0,.3); }
  .agent-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }

  /* ── Buttons ── */
  .action-btn {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; border-radius: 6px; padding: 6px 14px;
    font-size: 12px; cursor: pointer; font-family: var(--vscode-font-family);
    white-space: nowrap; transition: opacity .1s;
  }
  .action-btn:hover { opacity: .85; }
  .action-btn:active { opacity: .7; }
  .action-btn-secondary {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,.1));
  }
  .action-btn-ghost {
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: 1px solid transparent;
    padding: 6px 10px;
  }
  .action-btn-ghost:hover { text-decoration: underline; opacity: 1; }

  .footer-row { display: flex; gap: 12px; align-items: center; }
  .footer-btn {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,.1));
    border-radius: 6px; padding: 7px 16px; font-size: 12.5px; cursor: pointer;
    font-family: var(--vscode-font-family); transition: opacity .1s;
  }
  .footer-btn:hover { opacity: .85; }
  .dismiss-link {
    font-size: 12px; color: var(--vscode-descriptionForeground);
    cursor: pointer; text-decoration: underline; margin-left: auto;
  }
  .dismiss-link:hover { color: var(--vscode-foreground); }

  /* ── Screen Capture ── */
  .screen-capture-card {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 14px 16px; border-radius: 10px; margin-bottom: 32px;
    background: var(--vscode-welcomePage-tileBackground, rgba(255,255,255,.03));
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,.07));
  }
  .sc-enabled { border-color: rgba(78,201,176,.25); }
  .sc-disabled { border-color: rgba(204,167,0,.25); }
  .sc-icon {
    flex-shrink: 0; display: flex; align-items: center;
    padding-top: 2px; color: var(--vscode-descriptionForeground);
  }
  .sc-body { flex: 1; min-width: 0; }
  .sc-title { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
  .sc-desc { font-size: 11.5px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
  .sc-warning {
    display: flex; align-items: center; gap: 6px;
    margin-top: 8px; font-size: 11px; color: #cca700;
    background: rgba(204,167,0,.08); border: 1px solid rgba(204,167,0,.2);
    border-radius: 6px; padding: 6px 10px; line-height: 1.4;
  }
  .sc-warning svg { flex-shrink: 0; }
</style>
</head>
<body>

  <div class="header">
    <svg width="36" height="36" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#74C7EC"/>
          <stop offset="100%" stop-color="#B4A7D6"/>
        </linearGradient>
      </defs>
      <path d="M 60 20 A 30 30 0 1 0 80 75 A 35 35 0 1 1 60 20 Z" fill="url(#mg)"/>
    </svg>
    <div>
      <h1>LunaIDE Setup</h1>
      <p>Configure your Roblox development environment and AI agent integrations</p>
    </div>
  </div>

  ${statusBanner}

  <div class="section-label">Requirements</div>
  <div class="setup-list">${requirementRows}</div>

  <div class="section-label">AI Agent Integration</div>
  <div class="agent-list">${agentRows}</div>

  <div class="section-label">Managed Extensions</div>
  <div class="agent-list">${extensionRows}</div>

  <div class="section-label">Screen Capture</div>
  <div class="screen-capture-card ${screenCaptureEnabled ? 'sc-enabled' : 'sc-disabled'}">
    <div class="sc-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    </div>
    <div class="sc-body">
      <div class="sc-title">AI Screen Capture</div>
      <div class="sc-desc">
        ${screenCaptureEnabled
            ? 'Enabled — AI agents can capture screenshots of your Roblox Studio window.'
            : 'Disabled — AI agents cannot take screenshots of your screen. Enable only if you want agents to see your Roblox Studio window.'}
      </div>
      ${!screenCaptureEnabled ? `<div class="sc-warning">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        When enabled, AI agents can capture and view your screen at any time.
      </div>` : ''}
    </div>
    <button class="action-btn ${screenCaptureEnabled ? 'action-btn-secondary' : ''}" onclick="send('toggleScreenCapture')">
      ${screenCaptureEnabled ? 'Disable' : 'Enable'}
    </button>
  </div>

  <div class="footer-row">
    <button class="footer-btn" onclick="send('refresh')">↻ Refresh</button>
    <span class="dismiss-link" onclick="send('dismiss')">Don't show again</span>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  function send(command, agentId) {
    vscode.postMessage(agentId ? { command, agentId } : { command });
  }
  function updateExt(extId) {
    vscode.postMessage({ command: 'updateExtension', extId });
  }
</script>
</body>
</html>`;
    }

    dispose() {
        this._disposed = true;
        SetupPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
