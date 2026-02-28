import * as vscode from 'vscode';

/**
 * TreeItem for a Roblox instance in the Explorer panel.
 */
export class ExplorerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly instanceName: string,
        public readonly className: string,
        public readonly instancePath: string,
        public readonly childCount: number,
        public readonly scriptPath?: string,
    ) {
        super(
            instanceName,
            childCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        this.description = className;
        this.tooltip = `${instancePath}\nClass: ${className}\nChildren: ${childCount}`;
        this.contextValue = scriptPath ? 'scriptInstance' : 'instance';

        // Set icon based on class
        this.iconPath = new vscode.ThemeIcon(ExplorerTreeItem.getIconForClass(className));

        // Make scripts clickable to open
        if (scriptPath) {
            this.command = {
                command: 'vscode.open',
                title: 'Open Script',
                arguments: [vscode.Uri.file(scriptPath)],
            };
        }
    }

    private static getIconForClass(className: string): string {
        const iconMap: Record<string, string> = {
            // Services
            Workspace: 'globe',
            ServerScriptService: 'server',
            ServerStorage: 'archive',
            ReplicatedStorage: 'package',
            ReplicatedFirst: 'rocket',
            StarterGui: 'layout',
            StarterPlayer: 'person',
            StarterPack: 'briefcase',
            Lighting: 'lightbulb',
            SoundService: 'unmute',
            Teams: 'organization',
            Chat: 'comment',
            // Scripts
            Script: 'file-code',
            LocalScript: 'file-code',
            ModuleScript: 'file-symlink-file',
            // Parts
            Part: 'symbol-misc',
            MeshPart: 'symbol-misc',
            UnionOperation: 'symbol-misc',
            // Models & Folders
            Model: 'symbol-class',
            Folder: 'folder',
            // GUI
            ScreenGui: 'browser',
            Frame: 'symbol-interface',
            TextLabel: 'symbol-string',
            TextButton: 'symbol-event',
            ImageLabel: 'file-media',
            // Other
            Camera: 'eye',
            SpawnLocation: 'target',
            RemoteEvent: 'zap',
            RemoteFunction: 'zap',
            BindableEvent: 'plug',
            Tool: 'wrench',
        };

        return iconMap[className] || 'symbol-misc';
    }
}
