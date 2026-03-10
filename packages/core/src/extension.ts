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
import { WelcomePanel } from './welcome/welcomePanel.js';
import { SetupPanel } from './setup/setupPanel.js';
import { PlacesTreeView } from './places/placesTreeView.js';
import { ToolUpdateChecker } from './tools/toolUpdateChecker.js';
import { IdeUpdateChecker } from './tools/ideUpdateChecker.js';

import { getWorkspaceRoot, detectPlaces } from './utils/workspace.js';
import { registerWelcomeCommands } from './commands/welcomeCommands.js';
import { registerAgentCommands, registerMainCommands, IdeContext } from './commands/mainCommands.js';

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
  // Unset CLAUDECODE so terminals inside LunaIDE don't inherit the parent env var
  delete process.env['CLAUDECODE'];
  const termPlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
  const termEnvCfg = vscode.workspace.getConfiguration('terminal.integrated.env');
  const termEnvExisting = termEnvCfg.get<Record<string, string | null>>(termPlatform, {});
  if (termEnvExisting['CLAUDECODE'] !== null) {
    void termEnvCfg.update(termPlatform, { ...termEnvExisting, CLAUDECODE: null }, vscode.ConfigurationTarget.Global);
  }

  const outputChannel = vscode.window.createOutputChannel('LunaIDE');
  outputChannel.appendLine('LunaIDE is activating...');

  const cfg = vscode.workspace.getConfiguration();
  void cfg.update('workbench.startupEditor', 'none', vscode.ConfigurationTarget.Global);
  void cfg.update('workbench.welcomePage.walkthroughs.openOnInstall', false, vscode.ConfigurationTarget.Global);
  void cfg.update('workbench.tips.enabled', false, vscode.ConfigurationTarget.Global);
  void cfg.update('workbench.enableExperiments', false, vscode.ConfigurationTarget.Global);

  // Close built-in VS code welcome tabs
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

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      const isBuiltInWelcome = (tab: vscode.Tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        !tab.label.toLowerCase().includes('lunaide') &&
        (tab.label.toLowerCase().includes('welcome') || tab.label.toLowerCase().includes('walkthrough') || tab.label.toLowerCase().includes('get started'));

      for (const tab of e.opened) {
        if (isBuiltInWelcome(tab)) void vscode.window.tabGroups.close(tab);
      }
      for (const tab of e.changed) {
        if (tab.isActive && isBuiltInWelcome(tab)) void vscode.window.tabGroups.close(tab);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('workbench.action.showWelcomePage', () => {
      void WelcomePanel.createOrShow(context.extensionUri);
    })
  );

  const themeApplied = context.globalState.get<boolean>('lunaide.themeApplied', false);
  if (!themeApplied) {
    void cfg.update('workbench.colorTheme', 'LunaIDE Tokyo Night', vscode.ConfigurationTarget.Global);
    void context.globalState.update('lunaide.themeApplied', true);
  }

  const showTabsInspect = cfg.inspect('workbench.editor.showTabs');
  if (!showTabsInspect?.globalValue || showTabsInspect.globalValue === 'single') {
    void cfg.update('workbench.editor.showTabs', 'none', vscode.ConfigurationTarget.Global);
  }

  // Register Extracted Commands
  registerWelcomeCommands(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('lunaide.openSetup', () => {
      void SetupPanel.createOrShow(context);
    })
  );

  const agentStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  agentStatusBar.command = 'lunaide.connectAgent';
  agentStatusBar.tooltip = 'Connect AI Agent to LunaIDE MCP';
  context.subscriptions.push(agentStatusBar);
  registerAgentCommands(context, agentStatusBar);

  const setupDismissed = context.globalState.get<boolean>('lunaide.setupDismissed', false);
  if (!setupDismissed) {
    SetupPanel.checkSetup().then((hasIssues) => {
      if (hasIssues) {
        void vscode.window.showInformationMessage('LunaIDE setup is incomplete.', 'Open Setup').then((c) => {
          if (c === 'Open Setup') void SetupPanel.createOrShow(context);
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

  studioManager = new StudioManager();
  context.subscriptions.push(studioManager);

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
    void vscode.workspace.getConfiguration().update('workbench.editor.showTabs', 'multiple', vscode.ConfigurationTarget.Workspace);
    const filesExclude = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('exclude', {});
    if (!filesExclude['**/sourcemap.json']) {
      void vscode.workspace.getConfiguration('files').update(
        'exclude',
        { ...filesExclude, '**/sourcemap.json': true, '**/.lunaide': true, '**/.vscode': true },
        vscode.ConfigurationTarget.Workspace
      );
    }

    rojoManager = new RojoManager(context);
    context.subscriptions.push(rojoManager);

    let placeStatusBar: vscode.StatusBarItem | undefined;
    let placesTreeProvider: PlacesTreeView | undefined;

    if (places.length > 0) {
      // Deferring the complex interactive start for brevity if already active place exists
      let activePlace = context.workspaceState.get<string>('lunaide.activePlace');
      if (!activePlace || !places.includes(activePlace)) {
        activePlace = places[0];
      }
      await context.workspaceState.update('lunaide.activePlace', activePlace);

      placeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
      placeStatusBar.command = 'lunaide.switchPlace';
      placeStatusBar.text = `$(folder) ${activePlace}`;
      placeStatusBar.tooltip = 'Switch place';
      placeStatusBar.show();
      context.subscriptions.push(placeStatusBar);

      void vscode.commands.executeCommand('setContext', 'robloxIde.hasMultiplePlaces', true);
      placesTreeProvider = new PlacesTreeView(
        () => detectPlaces(workspaceFolder!),
        () => context.workspaceState.get<string>('lunaide.activePlace'),
      );
      vscode.window.registerTreeDataProvider('robloxIde.places', placesTreeProvider);
      context.subscriptions.push(placesTreeProvider);
    }

    void rojoManager.start();

    luauClient = new LuauClient(context);
    context.subscriptions.push(luauClient);
    void luauClient.start();

    sessionManager = new SessionManager(workspaceFolder);
    context.subscriptions.push(sessionManager);

    sessionTreeView = new SessionTreeView(sessionManager.getStore());
    vscode.window.registerTreeDataProvider('robloxIde.sessionHistory', sessionTreeView);
    context.subscriptions.push(sessionTreeView);

    studioHttpServer = new StudioHttpServer(studioManager);
    context.subscriptions.push(studioHttpServer);

    openCloudClient = new OpenCloudClient(context);
    await openCloudClient.initialize();
    context.subscriptions.push(openCloudClient);

    explorerTreeView = new ExplorerTreeView(workspaceFolder, studioManager);
    vscode.window.registerTreeDataProvider('robloxIde.explorer', explorerTreeView);
    context.subscriptions.push(explorerTreeView);

    propertyInspector = new PropertyInspectorPanel(studioManager);
    context.subscriptions.push(propertyInspector);

    registerScriptTemplates(context);

    bridgeServer = new BridgeServer(workspaceFolder, sessionManager, luauClient, studioManager, openCloudClient);
    context.subscriptions.push(bridgeServer);

    // Register all main application commands into index
    const ideContext: IdeContext = {
      workspaceFolder,
      context,
      rojoManager,
      luauClient,
      sessionManager,
      sessionTreeView,
      openCloudClient,
      explorerTreeView,
      propertyInspector,
      placesTreeProvider,
      placeStatusBar
    };
    registerMainCommands(ideContext);

    try {
      await bridgeServer.start();
      outputChannel.appendLine('Bridge server started.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Warning: Bridge server failed to start: ${message}`);
    }

    try {
      await studioHttpServer.start();
      outputChannel.appendLine('Studio server started.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Warning: Studio server failed to start: ${message}`);
    }
  }

  const toolUpdateChecker = new ToolUpdateChecker(context);
  context.subscriptions.push(toolUpdateChecker);
  void toolUpdateChecker.checkForUpdates();

  const ideUpdateChecker = new IdeUpdateChecker(context);
  context.subscriptions.push(ideUpdateChecker);
  void ideUpdateChecker.checkForUpdates();

  outputChannel.appendLine('LunaIDE activated.');
}

export function deactivate(): void { }
