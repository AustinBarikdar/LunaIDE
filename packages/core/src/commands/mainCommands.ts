import * as vscode from 'vscode';
import { RojoManager } from '../rojo/rojoManager.js';
import { LuauClient } from '../luau/luauClient.js';
import { SessionManager } from '../sessions/sessionManager.js';
import { SessionTreeView } from '../sessions/sessionTreeView.js';
import { OpenCloudClient } from '../opencloud/openCloudClient.js';
import { ExplorerTreeView } from '../explorer/explorerTreeView.js';
import { PropertyInspectorPanel } from '../explorer/propertyInspectorPanel.js';
import { PlacesTreeView } from '../places/placesTreeView.js';
import { SetupPanel } from '../setup/setupPanel.js';
import { AgentConnector, AGENT_IDS, AGENT_LABELS } from '../mcp/agentConnector.js';
import { getWorkspaceRoot, detectPlaces, writeProjectConfig, createPlace, readProfile, writeProfile } from '../utils/workspace.js';
import { WelcomePanel } from '../welcome/welcomePanel.js';

export interface IdeContext {
    workspaceFolder: string;
    context: vscode.ExtensionContext;
    rojoManager: RojoManager;
    luauClient: LuauClient;
    sessionManager: SessionManager;
    sessionTreeView: SessionTreeView;
    openCloudClient: OpenCloudClient;
    explorerTreeView: ExplorerTreeView;
    propertyInspector: PropertyInspectorPanel;
    placesTreeProvider?: PlacesTreeView;
    placeStatusBar?: vscode.StatusBarItem;
}

export function registerAgentCommands(context: vscode.ExtensionContext, agentStatusBar: vscode.StatusBarItem) {
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

export function registerMainCommands(ideContext: IdeContext) {
    const {
        context,
        workspaceFolder,
        rojoManager,
        luauClient,
        sessionManager,
        sessionTreeView,
        openCloudClient,
        explorerTreeView,
        propertyInspector,
        placesTreeProvider,
        placeStatusBar,
    } = ideContext;

    context.subscriptions.push(
        // Place switching
        vscode.commands.registerCommand('lunaide.switchPlace', async (placeName?: string) => {
            let allPlaces = detectPlaces(workspaceFolder);
            if (allPlaces.length === 0) return;

            let selected: string | undefined;
            if (placeName && allPlaces.includes(placeName)) {
                selected = placeName;
            } else {
                const pickItems = [
                    ...allPlaces.map((p) => ({ label: `$(folder) ${p}`, value: p })),
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
                    await createPlace(workspaceFolder, newName.trim(), placeId);
                    allPlaces = detectPlaces(workspaceFolder);
                    selected = newName.trim();
                } else {
                    selected = picked.value;
                }
            }

            await context.workspaceState.update('lunaide.activePlace', selected);
            rojoManager.setSuppressWatcherRestart(true);
            writeProjectConfig(workspaceFolder, selected);
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
}
