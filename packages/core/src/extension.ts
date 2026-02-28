import * as vscode from 'vscode';
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
  const outputChannel = vscode.window.createOutputChannel('LunaIDE');
  outputChannel.appendLine('LunaIDE is activating...');

  // Suppress VSCodium's built-in welcome page — we show our own
  const cfg = vscode.workspace.getConfiguration();
  const startupEditorInspect = cfg.inspect('workbench.startupEditor');
  if (!startupEditorInspect?.globalValue || startupEditorInspect.globalValue === 'welcomePage') {
    void cfg.update('workbench.startupEditor', 'none', vscode.ConfigurationTarget.Global);
  }
  // Hide tab bar globally — restored per-workspace when a project opens
  const showTabsInspect = cfg.inspect('workbench.editor.showTabs');
  if (!showTabsInspect?.globalValue || showTabsInspect.globalValue === 'single') {
    void cfg.update('workbench.editor.showTabs', 'none', vscode.ConfigurationTarget.Global);
  }

  // Always register commands so the palette works
  registerWelcomeCommands(context);

  const workspaceFolder = getWorkspaceRoot();
  const isRojoProject = workspaceFolder != null &&
    require('fs').existsSync(require('path').join(workspaceFolder, 'default.project.json'));

  if (!workspaceFolder) {
    outputChannel.appendLine('No folder open. Showing LunaIDE Welcome Screen.');
    setTimeout(() => {
      void WelcomePanel.createOrShow(context.extensionUri);
    }, 500);
  }

  if (isRojoProject) {
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

    // Auto-start Rojo for this project
    void rojoManager.start();

    // Initialize Luau LSP Client
    luauClient = new LuauClient(context, rojoManager);
    context.subscriptions.push(luauClient);

    // Initialize Session Manager
    sessionManager = new SessionManager(workspaceFolder);
    context.subscriptions.push(sessionManager);

    // Initialize Session TreeView
    sessionTreeView = new SessionTreeView(sessionManager.getStore());
    vscode.window.registerTreeDataProvider('robloxIde.sessionHistory', sessionTreeView);
    context.subscriptions.push(sessionTreeView);

    // Initialize Studio Manager
    studioManager = new StudioManager();
    context.subscriptions.push(studioManager);

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
      void WelcomePanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lunaide.createProject', async () => {
      // Step 1: Project name
      const projectName = await vscode.window.showInputBox({
        title: 'New Roblox Project',
        prompt: 'Project name',
        value: 'MyRobloxGame',
        validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty',
      });
      if (!projectName?.trim()) return;

      // Step 2: Location
      const parentFolderUris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Create Project Here',
        title: 'Choose project location',
      });
      if (!parentFolderUris || parentFolderUris.length === 0) return;

      // Step 3: Rojo setup
      const rojoChoice = await vscode.window.showQuickPick(
        [
          {
            label: '$(check) Full Rojo setup',
            description: 'Creates src/server, src/client, src/shared with default.project.json',
            value: 'rojo',
          },
          {
            label: '$(circle-slash) Minimal — no Rojo',
            description: 'Empty folder with a bare default.project.json',
            value: 'minimal',
          },
        ],
        { title: 'New Roblox Project', placeHolder: 'Initialize Rojo project structure?' }
      );
      if (!rojoChoice) return;

      const parentUri = parentFolderUris[0];
      const projectUri = vscode.Uri.joinPath(parentUri, projectName.trim());

      try {
        await vscode.workspace.fs.createDirectory(projectUri);

        if (rojoChoice.value === 'rojo') {
          // Full Rojo structure
          const src = (p: string) => vscode.Uri.joinPath(projectUri, p);
          await vscode.workspace.fs.createDirectory(src('src/server'));
          await vscode.workspace.fs.createDirectory(src('src/client'));
          await vscode.workspace.fs.createDirectory(src('src/shared'));

          // Stub scripts
          const serverScript = Buffer.from('-- Server entry point\n');
          const clientScript = Buffer.from('-- Client entry point\n');
          await vscode.workspace.fs.writeFile(src('src/server/init.server.luau'), serverScript);
          await vscode.workspace.fs.writeFile(src('src/client/init.client.luau'), clientScript);

          const rojoConfig = {
            name: projectName.trim(),
            tree: {
              $className: 'DataModel',
              ServerScriptService: {
                $className: 'ServerScriptService',
                Server: { $path: 'src/server' },
              },
              ReplicatedStorage: {
                $className: 'ReplicatedStorage',
                Shared: { $path: 'src/shared' },
              },
              StarterPlayer: {
                $className: 'StarterPlayer',
                StarterPlayerScripts: {
                  $className: 'StarterPlayerScripts',
                  Client: { $path: 'src/client' },
                },
              },
            },
          };
          await vscode.workspace.fs.writeFile(
            src('default.project.json'),
            Buffer.from(JSON.stringify(rojoConfig, null, 2))
          );

          // aftman.toml so the aftman shim resolves rojo for this project
          const aftmanToml =
            '# Aftman toolchain — managed by LunaIDE\n' +
            '[tools]\n' +
            'rojo = "rojo-rbx/rojo@7"\n';
          await vscode.workspace.fs.writeFile(src('aftman.toml'), Buffer.from(aftmanToml));
        } else {
          // Minimal
          const minimalConfig = {
            name: projectName.trim(),
            tree: { $className: 'DataModel' },
          };
          await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(projectUri, 'default.project.json'),
            Buffer.from(JSON.stringify(minimalConfig, null, 2))
          );
        }

        vscode.commands.executeCommand('vscode.openFolder', projectUri, false);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create project: ${err.message}`);
      }
    })
  );
}
