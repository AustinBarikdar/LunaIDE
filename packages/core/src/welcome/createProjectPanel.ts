import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BUILT_IN_PROFILES, writePlacesConfig, type Profile } from '../extension.js';
import { getInstalledRojoVersion, getInstalledLuauLspVersion, getLatestGitHubRelease } from '../tools/toolUpdateChecker.js';

export class CreateProjectPanel {
  public static currentPanel: CreateProjectPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'browse': {
            const uris = await vscode.window.showOpenDialog({
              canSelectFiles: false,
              canSelectFolders: true,
              canSelectMany: false,
              openLabel: 'Select Location',
              title: 'Choose project location',
            });
            if (uris?.[0]) {
              void this._panel.webview.postMessage({
                command: 'setLocation',
                path: uris[0].fsPath,
              });
            }
            return;
          }
          case 'create': {
            const { projectName, location, placeName, placeId, profileName } = message as {
              projectName: string;
              location: string;
              placeName: string;
              placeId: string;
              profileName: string;
            };
            await this._createProject(
              projectName.trim(),
              location,
              placeName.trim(),
              placeId?.trim() ? parseInt(placeId.trim(), 10) : undefined,
              profileName || 'Standard',
            );
            return;
          }
        }
      },
      null,
      this._disposables,
    );
  }

  public static createOrShow(extensionUri: vscode.Uri): void {
    if (CreateProjectPanel.currentPanel) {
      CreateProjectPanel.currentPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'lunaIdeCreateProject',
      'New Project — LunaIDE',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    CreateProjectPanel.currentPanel = new CreateProjectPanel(panel);
  }

  private async _createProject(
    projectName: string,
    location: string,
    placeName: string,
    placeId: number | undefined,
    profileName: string,
  ): Promise<void> {
    const projectPath = path.join(location, projectName);
    const projectUri = vscode.Uri.file(projectPath);
    const profile: Profile = BUILT_IN_PROFILES[profileName] ?? BUILT_IN_PROFILES['Standard'];

    try {
      // Create project directory
      await vscode.workspace.fs.createDirectory(projectUri);

      // Create place scaffold from profile
      const placeUri = vscode.Uri.joinPath(projectUri, placeName);
      for (const svc of Object.values(profile.services)) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(placeUri, svc.src));
      }

      // Write init.meta.json for each service folder
      for (const [, svc] of Object.entries(profile.services)) {
        const meta: Record<string, any> = { ignoreUnknownInstances: true };
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(placeUri, `${svc.src}/init.meta.json`),
          Buffer.from(JSON.stringify(meta, null, 2) + '\n'),
        );
      }

      // Create StarterPlayer subfolders with className meta
      if (profile.services['StarterPlayer']) {
        const spSrc = profile.services['StarterPlayer'].src;
        for (const child of ['StarterPlayerScripts', 'StarterCharacterScripts']) {
          const childDir = vscode.Uri.joinPath(placeUri, `${spSrc}/${child}`);
          await vscode.workspace.fs.createDirectory(childDir);
          await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(childDir, 'init.meta.json'),
            Buffer.from(JSON.stringify({ className: child }, null, 2) + '\n'),
          );
        }
      }

      // Entry-point scripts
      if (profile.services['ServerScriptService']) {
        const serverSrc = profile.services['ServerScriptService'].src;
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(placeUri, `${serverSrc}/main.server.luau`),
          Buffer.from('-- Server entry point\n'),
        );
      }
      if (profile.services['StarterPlayer']) {
        const spSrc = profile.services['StarterPlayer'].src;
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(placeUri, `${spSrc}/StarterPlayerScripts/main.client.luau`),
          Buffer.from('-- Client entry point\n'),
        );
      }

      // Build Rojo tree from profile
      const tree: Record<string, any> = { $className: 'DataModel' };
      for (const [serviceKey, svc] of Object.entries(profile.services)) {
        const parts = serviceKey.split('.');
        if (parts.length === 2) {
          const [parent, child] = parts;
          if (!tree[parent]) tree[parent] = { $className: parent };
          tree[parent][child] = {
            $className: child,
            $path: `${placeName}/${svc.src}`,
          };
        } else {
          tree[serviceKey] = {
            $className: serviceKey,
            $path: `${placeName}/${svc.src}`,
          };
        }
      }

      const config: Record<string, any> = { name: placeName };
      if (placeId) {
        config.placeId = placeId;
      }
      config.tree = tree;
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(projectUri, 'default.project.json'),
        Buffer.from(JSON.stringify(config, null, 2)),
      );

      // aftman.toml — resolve full semver versions
      const rojoVersion = getInstalledRojoVersion()
        ?? await getLatestGitHubRelease('rojo-rbx/rojo')
        ?? '7.4.4';
      const luauLspVersion = getInstalledLuauLspVersion()
        ?? await getLatestGitHubRelease('JohnnyMorganz/luau-lsp')
        ?? '1.34.1';
      const aftmanToml =
        '# Aftman toolchain — managed by LunaIDE\n' +
        '[tools]\n' +
        `rojo = "rojo-rbx/rojo@${rojoVersion}"\n` +
        `luau-lsp = "JohnnyMorganz/luau-lsp@${luauLspVersion}"\n`;
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(projectUri, 'aftman.toml'),
        Buffer.from(aftmanToml),
      );

      // Write .lunaide/places.json
      const placesConfig: Record<string, { placeId?: number }> = {};
      placesConfig[placeName] = placeId ? { placeId } : {};
      writePlacesConfig(projectPath, placesConfig);

      // Write .lunaide/profile.json
      const lunaideDir = path.join(projectPath, '.lunaide');
      if (!fs.existsSync(lunaideDir)) fs.mkdirSync(lunaideDir, { recursive: true });
      fs.writeFileSync(
        path.join(lunaideDir, 'profile.json'),
        JSON.stringify(profile, null, 2),
      );

      // Open the new project
      vscode.commands.executeCommand('vscode.openFolder', projectUri, false);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to create project: ${err.message}`);
    }
  }

  public dispose(): void {
    CreateProjectPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private _getHtml(): string {
    const defaultLocation = process.env.HOME
      ? path.join(process.env.HOME, 'Documents')
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New Project — LunaIDE</title>
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
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease forwards;
    opacity: 0;
  }

  @keyframes fadeIn { to { opacity: 1; } }

  .form-container {
    width: 480px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .form-header {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .form-header svg {
    flex-shrink: 0;
    color: var(--tn-comment);
  }

  .form-header h1 {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--tn-fg);
  }

  .form-header p {
    font-size: 12px;
    color: var(--tn-comment);
    margin-top: 3px;
  }

  .field { display: flex; flex-direction: column; gap: 5px; }

  .field label {
    font-size: 11px;
    font-weight: 600;
    color: var(--tn-fg-dark);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .field .helper {
    font-size: 11px;
    color: var(--tn-comment);
    margin-top: -1px;
  }

  .field input {
    background: var(--tn-bg-surface);
    color: var(--tn-fg);
    border: 1px solid var(--tn-border);
    border-radius: 6px;
    padding: 8px 11px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .field input::placeholder { color: var(--tn-gutter); }

  .field input:focus {
    border-color: var(--tn-border-focus);
  }

  .location-row {
    display: flex;
    gap: 8px;
  }

  .location-row input { flex: 1; }

  .browse-btn {
    background: var(--tn-bg-highlight);
    color: var(--tn-fg-dark);
    border: 1px solid var(--tn-border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s, border-color 0.1s;
  }

  .browse-btn:hover {
    background: var(--tn-gutter);
    border-color: var(--tn-gutter);
  }

  .path-preview {
    font-size: 11px;
    color: var(--tn-comment);
    margin-top: 2px;
    word-break: break-all;
  }

  .profile-cards {
    display: flex;
    gap: 8px;
  }

  .profile-card {
    flex: 1;
    background: var(--tn-bg-surface);
    border: 1.5px solid var(--tn-border);
    border-radius: 8px;
    padding: 10px 11px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .profile-card:hover {
    background: var(--tn-bg-highlight);
  }

  .profile-card.selected {
    border-color: var(--tn-blue);
    background: var(--tn-selection);
  }

  .profile-card .profile-name {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 3px;
    color: var(--tn-fg);
  }

  .profile-card.selected .profile-name {
    color: var(--tn-blue);
  }

  .profile-card .profile-desc {
    font-size: 10.5px;
    color: var(--tn-comment);
    line-height: 1.4;
  }

  .create-btn {
    background: var(--tn-blue);
    color: var(--tn-bg-dark);
    border: none;
    border-radius: 6px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.1s;
    margin-top: 4px;
  }

  .create-btn:hover { opacity: 0.9; }

  .create-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
</head>
<body>

<div class="form-container">
  <div class="form-header">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
    <div>
      <h1>New Project</h1>
      <p>Create a new Roblox game with Rojo</p>
    </div>
  </div>

  <div class="field">
    <label>Project Name</label>
    <input id="projectName" type="text" value="MyRobloxGame" spellcheck="false" />
  </div>

  <div class="field">
    <label>Location</label>
    <div class="location-row">
      <input id="location" type="text" value="${escapeHtml(defaultLocation)}" spellcheck="false" />
      <button class="browse-btn" onclick="browse()">Browse</button>
    </div>
    <div class="path-preview" id="pathPreview"></div>
  </div>

  <div class="field">
    <label>First Place Name</label>
    <input id="placeName" type="text" value="StartPlace" spellcheck="false" />
  </div>

  <div class="field">
    <label>Roblox Place ID (optional)</label>
    <input id="placeId" type="text" placeholder="e.g. 123456789" spellcheck="false" />
    <div class="helper">Find this in your game's URL on roblox.com</div>
  </div>

  <div class="field">
    <label>Project Profile</label>
    <div class="profile-cards">
      <div class="profile-card selected" data-profile="Standard" onclick="selectProfile(this)">
        <div class="profile-name">Standard</div>
        <div class="profile-desc">Server, Client, Shared</div>
      </div>
      <div class="profile-card" data-profile="Complete" onclick="selectProfile(this)">
        <div class="profile-name">Complete</div>
        <div class="profile-desc">All services including Workspace, GUI, Lighting</div>
      </div>
      <div class="profile-card" data-profile="Minimal" onclick="selectProfile(this)">
        <div class="profile-name">Minimal</div>
        <div class="profile-desc">Server + Shared only</div>
      </div>
    </div>
  </div>

  <button class="create-btn" id="createBtn" onclick="create()">Create Project</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  const projectNameEl = document.getElementById('projectName');
  const locationEl = document.getElementById('location');
  const placeNameEl = document.getElementById('placeName');
  const placeIdEl = document.getElementById('placeId');
  const pathPreviewEl = document.getElementById('pathPreview');
  const createBtn = document.getElementById('createBtn');

  let selectedProfile = 'Standard';

  function selectProfile(card) {
    document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedProfile = card.dataset.profile;
  }

  function updatePreview() {
    const name = projectNameEl.value.trim();
    const loc = locationEl.value.trim();
    if (name && loc) {
      pathPreviewEl.textContent = loc + '/' + name;
    } else {
      pathPreviewEl.textContent = '';
    }
    createBtn.disabled = !name || !loc || !placeNameEl.value.trim();
  }

  projectNameEl.addEventListener('input', updatePreview);
  locationEl.addEventListener('input', updatePreview);
  placeNameEl.addEventListener('input', updatePreview);
  updatePreview();

  placeIdEl.addEventListener('input', () => {
    const v = placeIdEl.value.trim();
    if (v && !/^\\d*$/.test(v)) {
      placeIdEl.style.borderColor = '#f7768e';
    } else {
      placeIdEl.style.borderColor = '';
    }
  });

  projectNameEl.focus();
  projectNameEl.select();

  function browse() {
    vscode.postMessage({ command: 'browse' });
  }

  function create() {
    if (createBtn.disabled) return;
    const placeIdVal = placeIdEl.value.trim();
    if (placeIdVal && !/^\\d+$/.test(placeIdVal)) return;
    vscode.postMessage({
      command: 'create',
      projectName: projectNameEl.value,
      location: locationEl.value,
      placeName: placeNameEl.value,
      placeId: placeIdVal,
      profileName: selectedProfile,
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !createBtn.disabled) create();
  });

  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'setLocation') {
      locationEl.value = msg.path;
      updatePreview();
    }
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
