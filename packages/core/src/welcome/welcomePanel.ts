import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

interface RecentProject {
  name: string;
  parentPath: string;
  fullPath: string;
}

export interface PlaceData {
  names: string[];
  active: string | undefined;
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
    placeData?: PlaceData,
  ) {
    this._panel = panel;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtml(recentProjects, totalRecent, placeData);

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
          case 'switchPlace':
            vscode.commands.executeCommand('lunaide.switchPlace', message.name as string);
            return;
        }
      },
      null,
      this._disposables,
    );
  }

  public static async createOrShow(extensionUri: vscode.Uri, placeData?: PlaceData) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._panel.reveal(column);
      if (placeData) WelcomePanel.refreshPlaces(placeData.names, placeData.active);
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

    WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri, recentProjects, total, placeData);
  }

  public static refreshPlaces(names: string[], active: string | undefined): void {
    if (!WelcomePanel.currentPanel) return;
    void WelcomePanel.currentPanel._panel.webview.postMessage({
      command: 'updatePlaces', names, active,
    });
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
        const home = os.homedir();
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

  private _getHtml(recentProjects: RecentProject[], totalRecent: number, placeData?: PlaceData): string {
    const isMac = process.platform === 'darwin';
    const modKey = isMac ? '⌘' : 'Ctrl';
    const recentRows = recentProjects.map((p) => {
      const letter = escapeHtml(p.name.charAt(0).toUpperCase());
      return `
            <div class="recent-row" onclick="openRecent(${escapeHtml(JSON.stringify(p.fullPath))})">
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

    const placesSection = (placeData && placeData.names.length > 0) ? `
<div class="place-section">
  <div class="section-label">Places</div>
  <div class="place-grid">
    ${placeData.names.map(n => {
      const isActive = n === placeData.active;
      const safeName = escapeHtml(n);
      return `
    <div class="place-card${isActive ? ' active' : ''}" data-place="${safeName}"
         onclick="switchToPlace(${escapeHtml(JSON.stringify(n))})">
      <div class="place-card-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <span class="place-card-name">${safeName}</span>
      <span class="place-badge" style="display:${isActive ? '' : 'none'}">active</span>
    </div>`;
    }).join('')}
  </div>
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

  :root {
    --tn-bg: #1a1b26;
    --tn-bg-dark: #16161e;
    --tn-bg-highlight: #292e42;
    --tn-bg-surface: #1f2335;
    --tn-fg: #c0caf5;
    --tn-fg-dark: #a9b1d6;
    --tn-comment: #565f89;
    --tn-gutter: #3b4261;
    --tn-blue: #7aa2f7;
    --tn-cyan: #7dcfff;
    --tn-purple: #bb9af7;
    --tn-green: #9ece6a;
    --tn-red: #f7768e;
    --tn-orange: #ff9e64;
    --tn-yellow: #e0af68;
    --tn-teal: #73daca;
    --tn-border: #292e42;
    --tn-border-focus: #3d59a1;
    --tn-selection: #283457;
  }

  body {
    background: var(--tn-bg);
    color: var(--tn-fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 48px 56px 36px;
    overflow: hidden;
    animation: fadeIn 0.3s ease forwards;
    opacity: 0;
  }

  @keyframes fadeIn { to { opacity: 1; } }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 44px;
  }

  .app-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .header-text h1 {
    font-size: 26px;
    font-weight: 600;
    color: var(--tn-fg);
    letter-spacing: 0.16em;
    margin-bottom: 4px;
    line-height: 1;
  }

  .header-text p {
    font-size: 12px;
    color: var(--tn-comment);
    letter-spacing: 0.01em;
  }

  /* ── Two-column body ── */
  .body {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    gap: 0 40px;
    flex: 1;
    min-height: 0;
  }

  .divider {
    background: var(--tn-border);
    align-self: stretch;
  }

  /* ── Section label ── */
  .section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--tn-comment);
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  /* ── Action rows ── */
  .action-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 13px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.1s;
    margin-bottom: 3px;
    background: transparent;
    border: 1px solid var(--tn-border);
  }

  .action-row:hover {
    background: var(--tn-bg-highlight);
  }

  .action-row:active { opacity: 0.8; }

  .action-icon-wrap {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--tn-comment);
  }

  .action-text { flex: 1; }

  .action-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--tn-fg);
    margin-bottom: 1px;
  }

  .action-desc {
    font-size: 11px;
    color: var(--tn-comment);
  }

  .action-shortcut {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--tn-bg-surface);
    border: 1px solid var(--tn-gutter);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 10px;
    color: var(--tn-comment);
    font-family: inherit;
    min-width: 18px;
  }

  /* ── Left column ── */
  .left-col {
    display: flex;
    flex-direction: column;
  }

  .actions-list { flex: 1; }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    background: var(--tn-bg-surface);
    border: 1px solid var(--tn-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.1s;
    margin-top: 16px;
  }

  .search-bar:hover {
    border-color: var(--tn-border-focus);
  }

  .search-icon { color: var(--tn-comment); flex-shrink: 0; }

  .search-text {
    flex: 1;
    font-size: 12px;
    color: var(--tn-gutter);
  }

  /* ── Recent projects ── */
  .right-col { display: flex; flex-direction: column; overflow: hidden; }

  .recent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .view-all {
    font-size: 11px;
    color: var(--tn-blue);
    cursor: pointer;
    text-decoration: none;
  }
  .view-all:hover { text-decoration: underline; }

  .recent-list { flex: 1; overflow: hidden; }

  .recent-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.1s;
    border-bottom: 1px solid var(--tn-bg-highlight);
  }

  .recent-row:last-child { border-bottom: none; }
  .recent-row:hover { background: var(--tn-bg-highlight); }
  .recent-row:hover .recent-name { color: var(--tn-blue); }

  .recent-avatar {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    background: var(--tn-bg-surface);
    border: 1px solid var(--tn-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--tn-fg-dark);
    flex-shrink: 0;
  }

  .recent-info { flex: 1; min-width: 0; }

  .recent-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--tn-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.1s;
    margin-bottom: 1px;
  }

  .recent-path {
    font-size: 11px;
    color: var(--tn-comment);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .show-more {
    padding: 12px 8px;
    font-size: 12px;
    color: var(--tn-comment);
    cursor: pointer;
    text-align: center;
  }
  .show-more:hover { color: var(--tn-fg); }
  .show-more-dots { margin-right: 6px; letter-spacing: 2px; }

  /* ── Places section ── */
  .place-section { margin-bottom: 20px; }
  .place-grid { display: flex; flex-direction: column; gap: 2px; }
  .place-card {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 6px; cursor: pointer;
    transition: background 0.1s;
    border: 1px solid transparent;
  }
  .place-card:hover { background: var(--tn-bg-highlight); }
  .place-card.active {
    background: var(--tn-selection);
    border-color: var(--tn-border-focus);
  }
  .place-card-icon {
    color: var(--tn-comment);
    flex-shrink: 0; display: flex; align-items: center;
  }
  .place-card.active .place-card-icon { color: var(--tn-blue); }
  .place-card-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--tn-fg); }
  .place-badge {
    font-size: 9px; padding: 2px 5px; border-radius: 3px;
    background: var(--tn-blue); color: var(--tn-bg-dark);
    font-weight: 600;
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="app-icon">
      <svg width="30" height="30" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7dcfff"/>
            <stop offset="50%" stop-color="#7aa2f7"/>
            <stop offset="100%" stop-color="#bb9af7"/>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
            <span class="kbd">${modKey}</span><span class="kbd">N</span>
          </div>
        </div>

        <div class="action-row" onclick="openProject()">
          <div class="action-icon-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="action-text">
            <div class="action-title">Open Folder</div>
            <div class="action-desc">Navigate to project</div>
          </div>
          <div class="action-shortcut">
            <span class="kbd">${modKey}</span><span class="kbd">O</span>
          </div>
        </div>

        <div class="action-row" onclick="openProject()">
          <div class="action-icon-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div class="action-text">
            <div class="action-title">Import Existing Project</div>
            <div class="action-desc">Convert a standard Rojo project</div>
          </div>
        </div>

        <div class="action-row" onclick="cloneRepo()">
          <div class="action-icon-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
        <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="search-text">Search files, commands, or help...</span>
        <div class="action-shortcut">
          <span class="kbd">${modKey}</span><span class="kbd">K</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="divider"></div>

    <!-- Right: Places (if any) + Recent projects -->
    <div class="right-col">
      ${placesSection}
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
  function switchToPlace(name) { vscode.postMessage({ command: 'switchPlace', name }); }

  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'updatePlaces') {
      document.querySelectorAll('.place-card').forEach(el => {
        const isActive = el.dataset.place === msg.active;
        el.classList.toggle('active', isActive);
        const badge = el.querySelector('.place-badge');
        if (badge) badge.style.display = isActive ? '' : 'none';
      });
    }
  });

  // Keyboard shortcuts
  const _isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  document.addEventListener('keydown', (e) => {
    const mod = _isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key === 'n') { e.preventDefault(); newProject(); }
    if (mod && e.key === 'o') { e.preventDefault(); openProject(); }
    if (mod && e.key === 'k') { e.preventDefault(); openSearch(); }
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
