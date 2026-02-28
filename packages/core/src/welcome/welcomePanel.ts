import * as vscode from 'vscode';
import * as path from 'path';

interface RecentProject {
    name: string;
    parentPath: string;
    fullPath: string;
}

export class WelcomePanel {
    public static currentPanel: WelcomePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        _extensionUri: vscode.Uri,
        recentProjects: RecentProject[],
        totalRecent: number,
    ) {
        this._panel = panel;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtml(recentProjects, totalRecent);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'openProject': {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Open Project Folder',
                        });
                        if (uris?.[0]) {
                            vscode.commands.executeCommand('vscode.openFolder', uris[0], false);
                        }
                        return;
                    }
                    case 'createProject':
                        vscode.commands.executeCommand('lunaide.createProject');
                        return;
                    case 'openRecent':
                        vscode.commands.executeCommand(
                            'vscode.openFolder',
                            vscode.Uri.file(message.path),
                            false,
                        );
                        return;
                    case 'viewAllRecent':
                        vscode.commands.executeCommand('workbench.action.openRecent');
                        return;
                    case 'cloneRepo':
                        vscode.commands.executeCommand('git.clone');
                        return;
                    case 'openSearch':
                        vscode.commands.executeCommand('workbench.action.quickOpen');
                        return;
                }
            },
            null,
            this._disposables,
        );
    }

    public static async createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WelcomePanel.currentPanel) {
            WelcomePanel.currentPanel._panel.reveal(column);
            return;
        }

        const { recentProjects, total } = await WelcomePanel._getRecentProjects();

        const panel = vscode.window.createWebviewPanel(
            'lunaIdeWelcome',
            'Welcome — LunaIDE',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        );

        WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri, recentProjects, total);
    }

    private static async _getRecentProjects(): Promise<{ recentProjects: RecentProject[]; total: number }> {
        try {
            const recent = await vscode.commands.executeCommand('_workbench.getRecentlyOpened') as {
                workspaces?: Array<{ folderUri?: vscode.Uri; workspace?: { configPath: vscode.Uri } }>;
            };
            const workspaces = recent?.workspaces ?? [];
            const folders = workspaces.filter((w) => w.folderUri);
            const total = folders.length;
            const recentProjects: RecentProject[] = folders.slice(0, 7).map((w) => {
                const fsPath = (w.folderUri as vscode.Uri).fsPath;
                const home = process.env.HOME ?? '';
                const displayPath = fsPath.startsWith(home)
                    ? '~' + fsPath.slice(home.length)
                    : fsPath;
                return {
                    name: path.basename(fsPath),
                    parentPath: path.dirname(displayPath),
                    fullPath: fsPath,
                };
            });
            return { recentProjects, total };
        } catch {
            return { recentProjects: [], total: 0 };
        }
    }

    public dispose() {
        WelcomePanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }

    private _getHtml(recentProjects: RecentProject[], totalRecent: number): string {
        const recentRows = recentProjects.map((p) => {
            const letter = escapeHtml(p.name.charAt(0).toUpperCase());
            return `
            <div class="recent-row" onclick="openRecent(${JSON.stringify(p.fullPath)})">
                <div class="recent-avatar">${letter}</div>
                <div class="recent-info">
                    <span class="recent-name">${escapeHtml(p.name)}</span>
                    <span class="recent-path">${escapeHtml(p.parentPath + '/' + p.name)}</span>
                </div>
            </div>`;
        }).join('');

        const showMoreBtn = totalRecent > recentProjects.length ? `
            <div class="show-more" onclick="viewAll()">
                <span class="show-more-dots">···</span> Show more projects
            </div>` : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome — LunaIDE</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: 13px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 52px 64px 40px;
    overflow: hidden;
    animation: fadeIn 0.3s ease forwards;
    opacity: 0;
  }

  @keyframes fadeIn { to { opacity: 1; } }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    gap: 22px;
    margin-bottom: 52px;
  }

  .app-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .header-text h1 {
    font-size: 30px;
    font-weight: 600;
    color: var(--vscode-foreground);
    letter-spacing: 0.18em;
    margin-bottom: 6px;
    line-height: 1;
  }

  .header-text p {
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    letter-spacing: 0.01em;
  }

  /* ── Two-column body ── */
  .body {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    gap: 0 48px;
    flex: 1;
    min-height: 0;
  }

  .divider {
    background: var(--vscode-widget-border, rgba(255,255,255,0.07));
    align-self: stretch;
  }

  /* ── Section label ── */
  .section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    margin-bottom: 16px;
  }

  /* ── Action rows ── */
  .action-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.1s;
    margin-bottom: 4px;
    background: var(--vscode-welcomePage-tileBackground, transparent);
    border: 1px solid var(--vscode-welcomePage-tileBorder, var(--vscode-widget-border, rgba(255,255,255,0.06)));
  }

  .action-row:hover {
    background: var(--vscode-welcomePage-tileHoverBackground, var(--vscode-list-hoverBackground));
  }

  .action-row:active { opacity: 0.8; }

  .action-icon-wrap {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--vscode-icon-foreground, var(--vscode-descriptionForeground));
  }

  .action-text { flex: 1; }

  .action-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground);
    margin-bottom: 2px;
  }

  .action-desc {
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground);
  }

  .action-shortcut {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-keybindingLabel-background, rgba(255,255,255,0.08));
    border: 1px solid var(--vscode-keybindingLabel-border, rgba(255,255,255,0.15));
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 11px;
    color: var(--vscode-keybindingLabel-foreground, var(--vscode-descriptionForeground));
    font-family: var(--vscode-font-family);
    min-width: 22px;
  }

  /* ── Left column bottom: search ── */
  .left-col {
    display: flex;
    flex-direction: column;
  }

  .actions-list { flex: 1; }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    background: var(--vscode-input-background, rgba(255,255,255,0.05));
    border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: border-color 0.1s;
    margin-top: 20px;
  }

  .search-bar:hover {
    border-color: var(--vscode-focusBorder, rgba(255,255,255,0.2));
  }

  .search-icon { color: var(--vscode-descriptionForeground); flex-shrink: 0; }

  .search-text {
    flex: 1;
    font-size: 13px;
    color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
  }

  /* ── Recent projects ── */
  .right-col { display: flex; flex-direction: column; overflow: hidden; }

  .recent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .view-all {
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    text-decoration: none;
  }
  .view-all:hover { text-decoration: underline; }

  .recent-list { flex: 1; overflow: hidden; }

  .recent-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 8px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.1s;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.05));
  }

  .recent-row:last-child { border-bottom: none; }
  .recent-row:hover { background: var(--vscode-list-hoverBackground); }
  .recent-row:hover .recent-name { color: var(--vscode-textLink-foreground); }

  .recent-avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--vscode-sideBar-background, rgba(255,255,255,0.06));
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    flex-shrink: 0;
  }

  .recent-info { flex: 1; min-width: 0; }

  .recent-name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.1s;
    margin-bottom: 2px;
  }

  .recent-path {
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .show-more {
    padding: 14px 8px;
    font-size: 12.5px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    text-align: center;
  }
  .show-more:hover { color: var(--vscode-foreground); }
  .show-more-dots { margin-right: 6px; letter-spacing: 2px; }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="app-icon">
      <svg width="38" height="38" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#74C7EC"/>
            <stop offset="100%" stop-color="#B4A7D6"/>
          </linearGradient>
        </defs>
        <path d="M 60 20 A 30 30 0 1 0 80 75 A 35 35 0 1 1 60 20 Z" fill="url(#mg)"/>
      </svg>
    </div>
    <div class="header-text">
      <h1>LunaIDE</h1>
      <p>Roblox Development Environment</p>
    </div>
  </div>

  <!-- Two-column body -->
  <div class="body">

    <!-- Left: Start actions -->
    <div class="left-col">
      <div class="section-label">Start</div>
      <div class="actions-list">

        <div class="action-row" onclick="newProject()">
          <div class="action-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <div class="action-text">
            <div class="action-title">New Project</div>
            <div class="action-desc">Create a new Roblox game</div>
          </div>
          <div class="action-shortcut">
            <span class="kbd">⌘</span><span class="kbd">N</span>
          </div>
        </div>

        <div class="action-row" onclick="openProject()">
          <div class="action-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="action-text">
            <div class="action-title">Open Folder</div>
            <div class="action-desc">Navigate to project</div>
          </div>
          <div class="action-shortcut">
            <span class="kbd">⌘</span><span class="kbd">O</span>
          </div>
        </div>

        <div class="action-row" onclick="cloneRepo()">
          <div class="action-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
              <path d="M6 9v6M15.7 7.3A6 6 0 0 1 18 15"/>
            </svg>
          </div>
          <div class="action-text">
            <div class="action-title">Clone Repository</div>
            <div class="action-desc">Get from GitHub</div>
          </div>
        </div>

      </div>

      <!-- Search bar -->
      <div class="search-bar" onclick="openSearch()">
        <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="search-text">Search files, commands, or help...</span>
        <div class="action-shortcut">
          <span class="kbd">⌘</span><span class="kbd">K</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="divider"></div>

    <!-- Right: Recent projects -->
    <div class="right-col">
      <div class="recent-header">
        <span class="section-label" style="margin-bottom:0">Recent</span>
        <span class="view-all" onclick="viewAll()">View All</span>
      </div>
      <div class="recent-list">
        ${recentRows}
      </div>
      ${showMoreBtn}
    </div>

  </div>

<script>
  const vscode = acquireVsCodeApi();
  function newProject() {
    vscode.postMessage({ command: 'createProject' });
  }
  function openProject() { vscode.postMessage({ command: 'openProject' }); }
  function cloneRepo() { vscode.postMessage({ command: 'cloneRepo' }); }
  function openSearch() { vscode.postMessage({ command: 'openSearch' }); }
  function openRecent(fullPath) { vscode.postMessage({ command: 'openRecent', path: fullPath }); }
  function viewAll() { vscode.postMessage({ command: 'viewAllRecent' }); }

  // ⌘N / ⌘O keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.metaKey && e.key === 'n') { e.preventDefault(); newProject(); }
    if (e.metaKey && e.key === 'o') { e.preventDefault(); openProject(); }
    if (e.metaKey && e.key === 'k') { e.preventDefault(); openSearch(); }
  });
</script>
</body>
</html>`;
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
