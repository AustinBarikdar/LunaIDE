import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RojoManager } from './rojo/rojoManager.js';
import { LuauClient } from './luau/luauClient.js';
import { SessionManager } from './sessions/sessionManager.js';
import { SessionTreeView } from './sessions/sessionTreeView.js';
import { BridgeServer } from './bridge/bridgeServer.js';
import { StudioManager } from './studio/studioManager.js';
import { StudioHttpServer } from './studio/studioHttpServer.js';
import { OpenCloudClient } from './opencloud/openCloudClient.js';
import { ExplorerTreeView } from './explorer/explorerTreeView.js';
import { PropertyInspectorPanel } from './explorer/propertyInspectorPanel.js';
import { registerScriptTemplates } from './templates/scriptTemplates.js';
import { WelcomePanel, PlaceData } from './welcome/welcomePanel.js';
import { CreateProjectPanel } from './welcome/createProjectPanel.js';
import { SetupPanel } from './setup/setupPanel.js';
import { AgentConnector, AGENT_IDS, AGENT_LABELS } from './mcp/agentConnector.js';
import { PlacesTreeView } from './places/placesTreeView.js';
import { ToolUpdateChecker } from './tools/toolUpdateChecker.js';

// ── Built-in project profiles ────────────────────────────────────────────────
export interface ProfileService {
  name: string;
  src: string;
}

export interface Profile {
  name: string;
  services: Record<string, ProfileService>;
}

export const BUILT_IN_PROFILES: Record<string, Profile> = {
  Standard: {
    name: 'Standard',
    services: {
      ServerScriptService: { name: 'Server', src: 'src/server' },
      ReplicatedStorage: { name: 'Shared', src: 'src/shared' },
      'StarterPlayer.StarterPlayerScripts': { name: 'Client', src: 'src/client' },
    },
  },
  Complete: {
    name: 'Complete',
    services: {
      ServerScriptService: { name: 'ServerScriptService', src: 'src/ServerScriptService' },
      ServerStorage: { name: 'ServerStorage', src: 'src/ServerStorage' },
      ReplicatedStorage: { name: 'ReplicatedStorage', src: 'src/ReplicatedStorage' },
      ReplicatedFirst: { name: 'ReplicatedFirst', src: 'src/ReplicatedFirst' },
      StarterPlayer: { name: 'StarterPlayer', src: 'src/StarterPlayer' },
      StarterGui: { name: 'StarterGui', src: 'src/StarterGui' },
      StarterPack: { name: 'StarterPack', src: 'src/StarterPack' },
      Workspace: { name: 'Workspace', src: 'src/Workspace' },
      Lighting: { name: 'Lighting', src: 'src/Lighting' },
      SoundService: { name: 'SoundService', src: 'src/SoundService' },
    },
  },
  Minimal: {
    name: 'Minimal',
    services: {
      ReplicatedStorage: { name: 'Shared', src: 'src/shared' },
      ServerScriptService: { name: 'Server', src: 'src/server' },
    },
  },
};

// ── Places config helpers ────────────────────────────────────────────────────
export function readPlacesConfig(workspaceFolder: string): Record<string, { placeId?: number }> {
  const cfgPath = path.join(workspaceFolder, '.lunaide', 'places.json');
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return {};
  }
}

export function writePlacesConfig(workspaceFolder: string, config: Record<string, { placeId?: number }>): void {
  const dir = path.join(workspaceFolder, '.lunaide');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'places.json'), JSON.stringify(config, null, 2));
}

// ── Profile helpers ──────────────────────────────────────────────────────────
export function readProfile(workspaceFolder: string): Profile {
  const profilePath = path.join(workspaceFolder, '.lunaide', 'profile.json');
  try {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    if (data && data.services) return data as Profile;
  } catch { /* fall through */ }
  return BUILT_IN_PROFILES['Standard'];
}

function writeProfile(workspaceFolder: string, profile: Profile): void {
  const dir = path.join(workspaceFolder, '.lunaide');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2));
}

let rojoManager: RojoManager;
let luauClient: LuauClient;
let sessionManager: SessionManager;
let sessionTreeView: SessionTreeView;
let bridgeServer: BridgeServer;
let studioManager: StudioManager;
let studioHttpServer: StudioHttpServer;
let openCloudClient: OpenCloudClient;
let explorerTreeView: ExplorerTreeView;
let propertyInspector: PropertyInspectorPanel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Unset CLAUDECODE so terminals inside LunaIDE don't inherit the parent
  // Claude Code session's env var (which blocks nested launches).
  // process.env covers child_process spawns; terminal.integrated.env covers
  // the VS Code integrated terminal which uses Electron's env independently.
  delete process.env['CLAUDECODE'];
  const termPlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
  const termEnvCfg = vscode.workspace.getConfiguration('terminal.integrated.env');
  const termEnvExisting = termEnvCfg.get<Record<string, string | null>>(termPlatform, {});
  if (termEnvExisting['CLAUDECODE'] !== null) {
    void termEnvCfg.update(
      termPlatform,
      { ...termEnvExisting, CLAUDECODE: null },
      vscode.ConfigurationTarget.Global
    );
  }

  const outputChannel = vscode.window.createOutputChannel('LunaIDE');
  outputChannel.appendLine('LunaIDE is activating...');

  // Suppress VSCodium's built-in welcome page, walkthroughs, and theme picker — we show our own
  const cfg = vscode.workspace.getConfiguration();
  void cfg.update('workbench.startupEditor', 'none', vscode.ConfigurationTarget.Global);
  void cfg.update('workbench.welcomePage.walkthroughs.openOnInstall', false, vscode.ConfigurationTarget.Global);
  void cfg.update('workbench.tips.enabled', false, vscode.ConfigurationTarget.Global);
  void cfg.update('workbench.enableExperiments', false, vscode.ConfigurationTarget.Global);

  // Close any VSCodium walkthrough / get-started / welcome tabs already open (but leave LunaIDE's alone)
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputWebview) {
        const label = tab.label.toLowerCase();
        if (!label.includes('lunaide') && (label.includes('walkthrough') || label.includes('get started') || label.includes('welcome'))) {
          void vscode.window.tabGroups.close(tab);
        }
      }
    }
  }

  // Reactively close built-in welcome tabs whenever they open OR become active (back-button navigation)
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      const isBuiltInWelcome = (tab: vscode.Tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        !tab.label.toLowerCase().includes('lunaide') &&
        (tab.label.toLowerCase().includes('welcome') || tab.label.toLowerCase().includes('walkthrough') || tab.label.toLowerCase().includes('get started'));

      for (const tab of e.opened) {
        if (isBuiltInWelcome(tab)) void vscode.window.tabGroups.close(tab);
      }
      // Back-button re-focuses an existing tab (appears in changed, not opened)
      for (const tab of e.changed) {
        if (tab.isActive && isBuiltInWelcome(tab)) void vscode.window.tabGroups.close(tab);
      }
    })
  );

  // Override the built-in welcome page command to show ours instead
  context.subscriptions.push(
    vscode.commands.registerCommand('workbench.action.showWelcomePage', () => {
      void WelcomePanel.createOrShow(context.extensionUri);
    })
  );

  // Set Tokyo Night theme on first launch
  const themeApplied = context.globalState.get<boolean>('lunaide.themeApplied', false);
  if (!themeApplied) {
    void cfg.update('workbench.colorTheme', 'LunaIDE Tokyo Night', vscode.ConfigurationTarget.Global);
    void context.globalState.update('lunaide.themeApplied', true);
  }
  // Hide tab bar globally — restored per-workspace when a project opens
  const showTabsInspect = cfg.inspect('workbench.editor.showTabs');
  if (!showTabsInspect?.globalValue || showTabsInspect.globalValue === 'single') {
    void cfg.update('workbench.editor.showTabs', 'none', vscode.ConfigurationTarget.Global);
  }

  // Always register commands so the palette works
  registerWelcomeCommands(context);

  // Register setup command (always available)
  context.subscriptions.push(
    vscode.commands.registerCommand('lunaide.openSetup', () => {
      void SetupPanel.createOrShow(context);
    })
  );

  // ── AI Agent status bar + connect command ─────────────────────────────────
  const agentStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  agentStatusBar.command = 'lunaide.connectAgent';
  agentStatusBar.tooltip = 'Connect AI Agent to LunaIDE MCP';
  context.subscriptions.push(agentStatusBar);

  function refreshAgentStatusBar() {
    const workspace = getWorkspaceRoot();
    const configured = AGENT_IDS.find((id) => AgentConnector.isAgentConfigured(id, workspace));
    if (configured) {
      const shortName = AGENT_LABELS[configured].split(' ')[0];
      agentStatusBar.text = `$(check) AI: ${shortName}`;
      agentStatusBar.backgroundColor = undefined;
    } else {
      agentStatusBar.text = '$(plug) AI Agent';
      agentStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    agentStatusBar.show();
  }

  refreshAgentStatusBar();

  context.subscriptions.push(
    vscode.commands.registerCommand('lunaide.connectAgent', async () => {
      const workspace = getWorkspaceRoot();
      type AgentQuickPickItem = vscode.QuickPickItem & { agentId?: string };

      const items: AgentQuickPickItem[] = AGENT_IDS.map((id) => {
        const configured = AgentConnector.isAgentConfigured(id, workspace);
        const cfgPath = AgentConnector.agentConfigPath(id, workspace);
        return {
          label: `${configured ? '$(check)' : '$(plug)'} ${AGENT_LABELS[id]}`,
          description: configured ? 'Configured' : undefined,
          detail: cfgPath,
          agentId: id,
        };
      });

      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
      items.push({ label: '$(settings-gear) Open Setup Panel' });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an AI agent to configure for LunaIDE MCP',
        matchOnDetail: true,
      });

      if (!selected) return;

      if (selected.agentId) {
        try {
          await AgentConnector.configureAgent(selected.agentId, context.extensionPath, workspace);
          vscode.window.showInformationMessage(
            `MCP server configured for ${AGENT_LABELS[selected.agentId as keyof typeof AGENT_LABELS]}. Restart it to connect.`
          );
          refreshAgentStatusBar();
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to configure agent: ${err.message}`);
        }
      } else {
        void SetupPanel.createOrShow(context);
      }
    })
  );
  // ── End AI Agent section ──────────────────────────────────────────────────

  // First-run setup check
  const setupDismissed = context.globalState.get<boolean>('lunaide.setupDismissed', false);
  if (!setupDismissed) {
    SetupPanel.checkSetup().then((hasIssues) => {
      if (hasIssues) {
        void vscode.window.showInformationMessage(
          'LunaIDE setup is incomplete.',
          'Open Setup'
        ).then((choice) => {
          if (choice === 'Open Setup') void SetupPanel.createOrShow(context);
        });
      }
    });
  }

  const workspaceFolder = getWorkspaceRoot();
  const places = workspaceFolder != null ? detectPlaces(workspaceFolder) : [];
  const isRojoProject = (workspaceFolder != null &&
    fs.existsSync(path.join(workspaceFolder, 'default.project.json'))) || places.length > 0;

  if (!workspaceFolder) {
    outputChannel.appendLine('No folder open. Showing LunaIDE Welcome Screen.');
    setTimeout(() => {
      void WelcomePanel.createOrShow(context.extensionUri);
    }, 500);
  }

  // ── Always register tree views so the sidebar never shows "no data provider" ──

  // Studio manager is always needed (studio instances view works without a project)
  studioManager = new StudioManager();
  context.subscriptions.push(studioManager);

  // Studio instances view — shows connected Studio sessions
  const studioInstancesEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  context.subscriptions.push(studioInstancesEmitter);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('robloxIde.studioInstances', {
      onDidChangeTreeData: studioInstancesEmitter.event,
      getTreeItem: (item: vscode.TreeItem) => item,
      getChildren: () => {
        const studios = studioManager.getConnectedStudios();
        if (studios.length === 0) return [];
        return studios.map((s) => {
          const item = new vscode.TreeItem(
            s.placeName || `Studio ${s.studioId.slice(0, 8)}`,
            vscode.TreeItemCollapsibleState.None
          );
          item.description = s.placeId ? `Place ${s.placeId}` : undefined;
          item.iconPath = new vscode.ThemeIcon('vm-connect');
          return item;
        });
      },
    })
  );

  // Session history and explorer — register placeholder providers when no project is open
  if (!isRojoProject) {
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('robloxIde.sessionHistory', {
        getTreeItem: (item: vscode.TreeItem) => item,
        getChildren: () => [],
      }),
      vscode.window.registerTreeDataProvider('robloxIde.explorer', {
        getTreeItem: (item: vscode.TreeItem) => item,
        getChildren: () => [],
      })
    );
  }

  if (isRojoProject && workspaceFolder != null) {
    // Restore tabs for this project workspace
    void vscode.workspace.getConfiguration().update('workbench.editor.showTabs', 'multiple', vscode.ConfigurationTarget.Workspace);

    // Hide generated/internal files from the explorer for this workspace
    const filesExclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('exclude', {});
    if (!filesExclude['**/sourcemap.json']) {
      void vscode.workspace.getConfiguration('files').update(
        'exclude',
        { ...filesExclude, '**/sourcemap.json': true, '**/.lunaide': true, '**/.vscode': true },
        vscode.ConfigurationTarget.Workspace
      );
    }

    // Initialize Rojo Manager
    rojoManager = new RojoManager(context);
    context.subscriptions.push(rojoManager);

    // Multi-place support
    let placeStatusBar: vscode.StatusBarItem | undefined;
    let placesTreeProvider: PlacesTreeView | undefined;

    if (places.length > 0) {
      let activePlace = context.workspaceState.get<string>('lunaide.activePlace');
      if (!activePlace || !places.includes(activePlace)) {
        const pickItems = [
          ...places.map(p => ({ label: `$(folder) ${p}`, value: p })),
          { label: '$(add) New Place...', value: '__new__' },
        ];
        const picked = await vscode.window.showQuickPick(pickItems, {
          placeHolder: 'Select a place to open',
          title: 'Choose a place',
        });
        if (picked?.value === '__new__') {
          const newName = await vscode.window.showInputBox({
            title: 'New Place',
            prompt: 'Name for the new place',
            validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
          });
          if (newName?.trim()) {
            const placeIdStr = await vscode.window.showInputBox({
              title: 'Place ID (optional)',
              prompt: 'Roblox Place ID — find this in your game\'s URL on roblox.com',
              validateInput: (v) => {
                if (!v.trim()) return undefined;
                return /^\d+$/.test(v.trim()) ? undefined : 'Must be a numeric Place ID';
              },
            });
            const placeId = placeIdStr?.trim() ? parseInt(placeIdStr.trim(), 10) : undefined;
            await createPlace(workspaceFolder!, newName.trim(), placeId);
            places.push(newName.trim());
            activePlace = newName.trim();
          } else {
            activePlace = places[0];
          }
        } else {
          activePlace = picked?.value ?? places[0];
        }
      }
      await context.workspaceState.update('lunaide.activePlace', activePlace);
      writeProjectConfig(workspaceFolder!, activePlace);

      placeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
      placeStatusBar.command = 'lunaide.switchPlace';
      placeStatusBar.text = `$(folder) ${activePlace}`;
      placeStatusBar.tooltip = 'Switch place';
      placeStatusBar.show();
      context.subscriptions.push(placeStatusBar);

      // Set context so the Places view is visible
      void vscode.commands.executeCommand('setContext', 'robloxIde.hasMultiplePlaces', true);
      // Build Places tree
      placesTreeProvider = new PlacesTreeView(
        () => detectPlaces(workspaceFolder!),
        () => context.workspaceState.get<string>('lunaide.activePlace'),
      );
      vscode.window.registerTreeDataProvider('robloxIde.places', placesTreeProvider);
      context.subscriptions.push(placesTreeProvider);
    }

    // Auto-start Rojo for this project
    void rojoManager.start();

    // Initialize Luau LSP Client
    luauClient = new LuauClient(context);
    context.subscriptions.push(luauClient);
    void luauClient.start();

    // Initialize Session Manager
    sessionManager = new SessionManager(workspaceFolder);
    context.subscriptions.push(sessionManager);

    // Initialize Session TreeView
    sessionTreeView = new SessionTreeView(sessionManager.getStore());
    vscode.window.registerTreeDataProvider('robloxIde.sessionHistory', sessionTreeView);
    context.subscriptions.push(sessionTreeView);

    // Initialize Studio HTTP Server (accepts Studio plugin connections)
    studioHttpServer = new StudioHttpServer(studioManager);
    context.subscriptions.push(studioHttpServer);

    // Initialize OpenCloud Client
    openCloudClient = new OpenCloudClient(context);
    await openCloudClient.initialize();
    context.subscriptions.push(openCloudClient);

    // Initialize Explorer TreeView
    explorerTreeView = new ExplorerTreeView(workspaceFolder, studioManager);
    vscode.window.registerTreeDataProvider('robloxIde.explorer', explorerTreeView);
    context.subscriptions.push(explorerTreeView);

    // Initialize Property Inspector
    propertyInspector = new PropertyInspectorPanel(studioManager);
    context.subscriptions.push(propertyInspector);

    // Register Script Templates
    registerScriptTemplates(context);

    // Initialize Bridge Server (accepts MCP server connections)
    bridgeServer = new BridgeServer(workspaceFolder, sessionManager, luauClient, rojoManager, studioManager, openCloudClient);
    context.subscriptions.push(bridgeServer);

    // Register commands
    context.subscriptions.push(
      // Place switching
      vscode.commands.registerCommand('lunaide.switchPlace', async (placeName?: string) => {
        let allPlaces = detectPlaces(workspaceFolder!);
        if (allPlaces.length === 0) return;

        let selected: string | undefined;
        if (placeName && allPlaces.includes(placeName)) {
          selected = placeName;
        } else {
          const pickItems = [
            ...allPlaces.map(p => ({ label: `$(folder) ${p}`, value: p })),
            { label: '$(add) New Place...', value: '__new__' },
          ];
          const picked = await vscode.window.showQuickPick(pickItems, { placeHolder: 'Select a place to work on' });
          if (!picked) return;
          if (picked.value === '__new__') {
            const newName = await vscode.window.showInputBox({
              title: 'New Place',
              prompt: 'Name for the new place',
              validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
            });
            if (!newName?.trim()) return;
            const placeIdStr = await vscode.window.showInputBox({
              title: 'Place ID (optional)',
              prompt: 'Roblox Place ID — find this in your game\'s URL on roblox.com',
              validateInput: (v) => {
                if (!v.trim()) return undefined;
                return /^\d+$/.test(v.trim()) ? undefined : 'Must be a numeric Place ID';
              },
            });
            const placeId = placeIdStr?.trim() ? parseInt(placeIdStr.trim(), 10) : undefined;
            await createPlace(workspaceFolder!, newName.trim(), placeId);
            allPlaces = detectPlaces(workspaceFolder!);
            selected = newName.trim();
          } else {
            selected = picked.value;
          }
        }

        await context.workspaceState.update('lunaide.activePlace', selected);
        rojoManager.setSuppressWatcherRestart(true);
        writeProjectConfig(workspaceFolder!, selected);
        await rojoManager.restart();
        rojoManager.setSuppressWatcherRestart(false);
        if (placeStatusBar) placeStatusBar.text = `$(folder) ${selected}`;
        placesTreeProvider?.refresh();
        WelcomePanel.refreshPlaces(allPlaces, selected);
      }),

      // Rojo commands
      vscode.commands.registerCommand('robloxIde.rojo.start', () => rojoManager.start()),
      vscode.commands.registerCommand('robloxIde.rojo.stop', () => rojoManager.stop()),
      vscode.commands.registerCommand('robloxIde.rojo.restart', () => rojoManager.restart()),

      // Luau commands
      vscode.commands.registerCommand('robloxIde.luau.restart', () => luauClient.restart()),

      // Instructions
      vscode.commands.registerCommand('robloxIde.instructions.edit', () => openInstructions()),

      // Session commands
      vscode.commands.registerCommand('robloxIde.sessions.viewHistory', () => {
        sessionTreeView.refresh();
        vscode.commands.executeCommand('robloxIde.sessionHistory.focus');
      }),
      vscode.commands.registerCommand('robloxIde.sessions.rollback', async () => {
        const snapshots = sessionManager.getStore().listSnapshots();
        if (snapshots.length === 0) {
          vscode.window.showInformationMessage('No snapshots available.');
          return;
        }

        const items = snapshots.map((s) => ({
          label: s.description,
          description: `${new Date(s.timestamp).toLocaleString()} — ${s.fileCount} file(s)`,
          id: s.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a snapshot to rollback to',
        });

        if (selected) {
          await sessionManager.rollbackToSnapshot(selected.id);
          sessionTreeView.refresh();
          vscode.window.showInformationMessage(`Rolled back to: ${selected.label}`);
        }
      }),
      vscode.commands.registerCommand('robloxIde.sessions.selectSnapshot', (snapshotId: string) => {
        vscode.window.showInformationMessage(`Snapshot: ${snapshotId}`);
      }),

      // OpenCloud commands
      vscode.commands.registerCommand('robloxIde.opencloud.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
          prompt: 'Enter your Roblox Open Cloud API key',
          password: true,
          placeHolder: 'API key',
        });
        if (key) {
          await openCloudClient.setApiKey(key);
          vscode.window.showInformationMessage('Open Cloud API key saved securely.');
        }
      }),
      vscode.commands.registerCommand('robloxIde.opencloud.clearApiKey', async () => {
        await openCloudClient.clearApiKey();
        vscode.window.showInformationMessage('Open Cloud API key cleared.');
      }),

      // Profile commands
      vscode.commands.registerCommand('lunaide.editProfile', async () => {
        const profilePath = vscode.Uri.joinPath(vscode.Uri.file(workspaceFolder), '.lunaide', 'profile.json');
        try {
          await vscode.workspace.fs.stat(profilePath);
        } catch {
          // Write current profile so user has something to edit
          const profile = readProfile(workspaceFolder);
          writeProfile(workspaceFolder, profile);
        }
        const doc = await vscode.workspace.openTextDocument(profilePath);
        await vscode.window.showTextDocument(doc);
      }),

      // Explorer commands
      vscode.commands.registerCommand('robloxIde.explorer.refresh', () => explorerTreeView.refresh()),
      vscode.commands.registerCommand('robloxIde.explorer.inspectProperties', (instancePath: string) => {
        propertyInspector.show(instancePath);
      })
    );

    // Start Bridge Server
    try {
      await bridgeServer.start();
      outputChannel.appendLine('Bridge server started.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Warning: Bridge server failed to start: ${message}`);
    }

    // Start Studio HTTP Server
    try {
      await studioHttpServer.start();
      outputChannel.appendLine('Studio server started.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Warning: Studio server failed to start: ${message}`);
    }



  }

  // Check for tool updates (Rojo, Luau LSP) globally
  const toolUpdateChecker = new ToolUpdateChecker(context);
  context.subscriptions.push(toolUpdateChecker);
  void toolUpdateChecker.checkForUpdates();

  outputChannel.appendLine('LunaIDE activated.');
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions
}

async function openInstructions(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }

  const instructionsPath = vscode.Uri.joinPath(folders[0].uri, '.lunaide', 'instructions.md');

  try {
    await vscode.workspace.fs.stat(instructionsPath);
  } catch {
    // File doesn't exist, create it with a template
    const template = Buffer.from(
      '# LunaIDE Instructions\n\n' +
      'Write persistent instructions here that AI agents will read when working on your project.\n\n' +
      '## Project Overview\n\n' +
      '<!-- Describe your game/project here -->\n\n' +
      '## Coding Conventions\n\n' +
      '<!-- Describe your preferred coding style, naming conventions, etc. -->\n\n' +
      '## Important Notes\n\n' +
      '<!-- Add any important context AI agents should know -->\n'
    );
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folders[0].uri, '.lunaide'));
    await vscode.workspace.fs.writeFile(instructionsPath, template);
  }

  const doc = await vscode.workspace.openTextDocument(instructionsPath);
  await vscode.window.showTextDocument(doc);
}

async function createPlace(workspaceFolder: string, name: string, placeId?: number): Promise<void> {
  const profile = readProfile(workspaceFolder);
  const placeDir = path.join(workspaceFolder, name);
  const placeUri = vscode.Uri.file(placeDir);

  // Create all directories from the profile
  for (const svc of Object.values(profile.services)) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(placeUri, svc.src));
  }

  // Create entry-point scripts for common services
  if (profile.services['ServerScriptService']) {
    const serverSrc = profile.services['ServerScriptService'].src;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(placeUri, `${serverSrc}/init.server.luau`),
      Buffer.from('-- Server entry point\n')
    );
  }
  if (profile.services['StarterPlayer.StarterPlayerScripts']) {
    const clientSrc = profile.services['StarterPlayer.StarterPlayerScripts'].src;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(placeUri, `${clientSrc}/init.client.luau`),
      Buffer.from('-- Client entry point\n')
    );
  }

  // Update places.json with the optional placeId
  const placesConfig = readPlacesConfig(workspaceFolder);
  placesConfig[name] = placeId ? { placeId } : {};
  writePlacesConfig(workspaceFolder, placesConfig);
}

function detectPlaces(workspaceFolder: string): string[] {
  try {
    return fs.readdirSync(workspaceFolder, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') &&
        fs.existsSync(path.join(workspaceFolder, e.name, 'src')))
      .map(e => e.name)
      .sort();
  } catch { return []; }
}

function writeProjectConfig(workspaceFolder: string, placeName: string): void {
  const profile = readProfile(workspaceFolder);
  const tree: Record<string, any> = { $className: 'DataModel' };

  for (const [serviceKey, svc] of Object.entries(profile.services)) {
    const parts = serviceKey.split('.');
    if (parts.length === 2) {
      // Nested service, e.g. "StarterPlayer.StarterPlayerScripts"
      const [parent, child] = parts;
      if (!tree[parent]) tree[parent] = { $className: parent };
      tree[parent][child] = {
        $className: child,
        $path: `${placeName}/${svc.src}`,
      };
    } else {
      // Top-level service
      tree[serviceKey] = {
        $className: serviceKey,
        $path: `${placeName}/${svc.src}`,
      };
    }
  }

  const config = { name: placeName, tree };
  fs.writeFileSync(
    path.join(workspaceFolder, 'default.project.json'),
    JSON.stringify(config, null, 2)
  );
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}

/**
 * Exported for MCP server bridge access.
 */
export function getRojoManager(): RojoManager {
  return rojoManager;
}

export function getLuauClient(): LuauClient {
  return luauClient;
}

export function getSessionManager(): SessionManager {
  return sessionManager;
}

function registerWelcomeCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('lunaide.showWelcome', () => {
      const ws = getWorkspaceRoot();
      const names = ws ? detectPlaces(ws) : [];
      const active = context.workspaceState.get<string>('lunaide.activePlace');
      const placeData: PlaceData | undefined = names.length > 0 ? { names, active } : undefined;
      void WelcomePanel.createOrShow(context.extensionUri, placeData);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lunaide.createProject', () => {
      void CreateProjectPanel.createOrShow(context.extensionUri);
    })
  );
}
