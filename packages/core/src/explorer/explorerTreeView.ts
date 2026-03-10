import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExplorerTreeItem } from './explorerTreeItem.js';
import { StudioManager } from '../studio/studioManager.js';
import { ROJO_PROJECT_FILE } from '@roblox-ide/shared';

interface RojoTreeNode {
    $className?: string;
    $path?: string;
    [key: string]: unknown;
}

/**
 * TreeDataProvider for the Roblox Instance Explorer.
 * Shows instance hierarchy from either the live Studio connection
 * or the static Rojo project file.
 */
export class ExplorerTreeView implements vscode.TreeDataProvider<ExplorerTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<ExplorerTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private workspaceRoot: string;
    private studioManager: StudioManager;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;

    constructor(workspaceRoot: string, studioManager: StudioManager) {
        this.workspaceRoot = workspaceRoot;
        this.studioManager = studioManager;

        // Auto-refresh when Studio data updates
        this.refreshInterval = setInterval(() => {
            if (this.studioManager.getConnectedStudios().length > 0) {
                this._onDidChangeTreeData.fire(undefined);
            }
        }, 15000);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ExplorerTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ExplorerTreeItem): Promise<ExplorerTreeItem[]> {
        // Try live Studio first, fall back to Rojo project
        const studioId = this.studioManager.getFirstStudioId();
        if (studioId) {
            return this.getStudioChildren(studioId, element);
        }
        return this.getRojoChildren(element);
    }

    /**
     * Get children from a live Studio connection.
     */
    private async getStudioChildren(studioId: string, element?: ExplorerTreeItem): Promise<ExplorerTreeItem[]> {
        try {
            const instancePath = element?.instancePath || 'game';
            const result = await this.studioManager.sendCommand(studioId, 'get_children', {
                path: instancePath,
                depth: 1,
            }) as { children?: Array<{ name: string; className: string; childCount: number }> };

            if (!result?.children) return [];

            return result.children.map((child) =>
                new ExplorerTreeItem(
                    child.name,
                    child.className,
                    `${instancePath}.${child.name}`,
                    child.childCount,
                )
            );
        } catch {
            // Fall back to Rojo
            return this.getRojoChildren(element);
        }
    }

    /**
     * Get children from the static Rojo project file.
     */
    private getRojoChildren(element?: ExplorerTreeItem): ExplorerTreeItem[] {
        const projectFile = path.join(this.workspaceRoot, ROJO_PROJECT_FILE);
        if (!fs.existsSync(projectFile)) return [];

        try {
            const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
            const tree = project.tree;
            if (!tree) return [];

            if (!element) {
                // Root level — show the game tree
                return this.rojoNodeToItems(tree, 'game');
            }

            // Navigate to the element's position in the tree
            const parts = element.instancePath.split('.').filter(Boolean);
            let node: RojoTreeNode = tree;
            for (const part of parts) {
                if (part === 'game' || part === project.name) continue;
                if (node[part] && typeof node[part] === 'object') {
                    node = node[part] as RojoTreeNode;
                } else {
                    return [];
                }
            }

            return this.rojoNodeToItems(node, element.instancePath);
        } catch (err) {
            console.warn(`[LunaIDE] Failed to parse ${ROJO_PROJECT_FILE}: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    private rojoNodeToItems(node: RojoTreeNode, parentPath: string): ExplorerTreeItem[] {
        const items: ExplorerTreeItem[] = [];
        for (const [key, value] of Object.entries(node)) {
            if (key.startsWith('$')) continue;
            if (typeof value !== 'object' || value === null) continue;

            const child = value as RojoTreeNode;
            const className = child.$className || 'Folder';
            const childPath = `${parentPath}.${key}`;

            // Count non-$ children
            const childCount = Object.keys(child).filter((k) => !k.startsWith('$')).length;

            // Resolve script path if $path is specified
            let scriptPath: string | undefined;
            if (child.$path && typeof child.$path === 'string') {
                const resolved = path.join(this.workspaceRoot, child.$path);
                if (fs.existsSync(resolved)) {
                    scriptPath = resolved;
                }
            }

            items.push(new ExplorerTreeItem(key, className, childPath, childCount, scriptPath));
        }
        return items;
    }

    dispose(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this._onDidChangeTreeData.dispose();
    }
}
