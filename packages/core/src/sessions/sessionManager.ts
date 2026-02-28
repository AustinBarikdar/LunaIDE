import * as vscode from 'vscode';
import * as fs from 'fs';
import { FileChange } from '@roblox-ide/shared';
import { SnapshotStore } from './snapshotStore.js';

/**
 * Manages session snapshots — intercepts file saves and creates automatic snapshots,
 * and supports manual snapshot creation and rollback.
 */
export class SessionManager implements vscode.Disposable {
    private snapshotStore: SnapshotStore;
    private pendingChanges: Map<string, { before: string }> = new Map();
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;
    private enabled: boolean;

    constructor(private workspaceRoot: string) {
        this.outputChannel = vscode.window.createOutputChannel('LunaIDE: Sessions');
        this.snapshotStore = new SnapshotStore(workspaceRoot);
        this.enabled = vscode.workspace.getConfiguration('robloxIde.sessions').get<boolean>('enabled', true);

        if (this.enabled) {
            // Capture the "before" state when a document is about to save
            this.disposables.push(
                vscode.workspace.onWillSaveTextDocument((e) => {
                    this.onWillSave(e);
                })
            );

            // Create snapshot after document is saved
            this.disposables.push(
                vscode.workspace.onDidSaveTextDocument((doc) => {
                    this.onDidSave(doc);
                })
            );
        }

        this.disposables.push(this.outputChannel, this.snapshotStore);
    }

    /**
     * Create a manual snapshot (e.g., when MCP write_script is called).
     */
    async createSnapshot(description: string, changes: FileChange[]): Promise<string> {
        const id = await this.snapshotStore.createSnapshot(description, changes);
        this.log(`Snapshot created: ${id} — ${description}`);
        return id;
    }

    /**
     * Create a snapshot for a single file before writing new content.
     */
    async snapshotBeforeWrite(filePath: string, newContent: string, description?: string): Promise<string> {
        const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
        const changes: FileChange[] = [{ filePath, before, after: newContent }];
        return this.createSnapshot(description || `Write to ${filePath}`, changes);
    }

    /**
     * Rollback to a snapshot — restores the "before" state of all files in the snapshot.
     */
    async rollbackToSnapshot(snapshotId: string): Promise<void> {
        const contents = this.snapshotStore.getBeforeContents(snapshotId);
        if (!contents) {
            throw new Error(`Snapshot not found: ${snapshotId}`);
        }

        // Create a snapshot of the current state before rolling back
        const currentChanges: FileChange[] = [];
        for (const [filePath, beforeContent] of contents) {
            const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
            currentChanges.push({ filePath, before: currentContent, after: beforeContent });
        }
        await this.createSnapshot(`Rollback to ${snapshotId}`, currentChanges);

        // Apply the rollback
        for (const [filePath, content] of contents) {
            fs.writeFileSync(filePath, content, 'utf-8');
        }

        this.log(`Rolled back to snapshot: ${snapshotId}`);
    }

    /**
     * Get the snapshot store for listing/inspecting snapshots.
     */
    getStore(): SnapshotStore {
        return this.snapshotStore;
    }

    private onWillSave(e: vscode.TextDocumentWillSaveEvent): void {
        const doc = e.document;
        if (doc.uri.scheme !== 'file') return;

        // Capture the before-state
        this.pendingChanges.set(doc.uri.fsPath, { before: doc.getText() });
    }

    private async onDidSave(doc: vscode.TextDocument): Promise<void> {
        if (doc.uri.scheme !== 'file') return;

        const pending = this.pendingChanges.get(doc.uri.fsPath);
        if (!pending) return;
        this.pendingChanges.delete(doc.uri.fsPath);

        const after = doc.getText();
        if (pending.before === after) return; // No actual change

        const changes: FileChange[] = [{ filePath: doc.uri.fsPath, before: pending.before, after }];
        await this.createSnapshot(`Saved ${doc.fileName}`, changes);
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }
}
