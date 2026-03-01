import * as vscode from 'vscode';

interface PlaceItem { name: string; }

export class PlacesTreeView implements vscode.TreeDataProvider<PlaceItem>, vscode.Disposable {
    private _onChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onChange.event;

    constructor(
        private readonly getPlaces: () => string[],
        private readonly getActivePlace: () => string | undefined,
    ) {}

    refresh(): void { this._onChange.fire(); }

    getTreeItem(item: PlaceItem): vscode.TreeItem {
        const isActive = item.name === this.getActivePlace();
        const ti = new vscode.TreeItem(item.name, vscode.TreeItemCollapsibleState.None);
        ti.iconPath = new vscode.ThemeIcon(isActive ? 'folder-opened' : 'folder');
        ti.description = isActive ? 'active' : '';
        ti.command = { command: 'lunaide.switchPlace', title: 'Switch Place', arguments: [item.name] };
        ti.contextValue = isActive ? 'activePlaceItem' : 'placeItem';
        return ti;
    }

    getChildren(): PlaceItem[] {
        return this.getPlaces().map(name => ({ name }));
    }

    dispose(): void { this._onChange.dispose(); }
}
