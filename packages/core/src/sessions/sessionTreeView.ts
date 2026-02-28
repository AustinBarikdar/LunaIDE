import * as vscode from 'vscode';
import { SnapshotMeta } from '@roblox-ide/shared';
import { SnapshotStore } from './snapshotStore.js';

/**
 * TreeView provider for the session history panel in the LunaIDE sidebar.
 */
export class SessionTreeView implements vscode.TreeDataProvider<SnapshotTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<SnapshotTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private disposables: vscode.Disposable[] = [];

    constructor(private store: SnapshotStore) {
        this.disposables.push(this._onDidChangeTreeData);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: SnapshotTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): SnapshotTreeItem[] {
        const snapshots = this.store.listSnapshots();
        return snapshots.map((s) => new SnapshotTreeItem(s));
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}

class SnapshotTreeItem extends vscode.TreeItem {
    constructor(public readonly snapshot: SnapshotMeta) {
        super(snapshot.description, vscode.TreeItemCollapsibleState.None);

        const date = new Date(snapshot.timestamp);
        const timeStr = date.toLocaleTimeString();
        const dateStr = date.toLocaleDateString();

        this.description = `${dateStr} ${timeStr}`;
        this.tooltip = `Snapshot: ${snapshot.id}\nFiles changed: ${snapshot.fileCount}\n${snapshot.description}`;
        this.iconPath = new vscode.ThemeIcon('history');
        this.contextValue = 'snapshot';

        // Store snapshot ID for command access
        this.command = {
            command: 'robloxIde.sessions.selectSnapshot',
            title: 'Select Snapshot',
            arguments: [snapshot.id],
        };
    }
}
