import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SessionSnapshot, FileChange, SnapshotMeta } from '@roblox-ide/shared';
import { ROBLOXIDE_DIR, SESSIONS_DIR, MAX_SNAPSHOTS } from '@roblox-ide/shared';
import { computeDiff, TextDiff } from './diffEngine.js';

interface StoredSnapshot {
    id: string;
    timestamp: number;
    description: string;
    changes: Array<{
        filePath: string;
        diff: TextDiff;
        beforeContent: string;
    }>;
}

/**
 * Persists session snapshots as JSON files in .lunaide/sessions/.
 */
export class SnapshotStore implements vscode.Disposable {
    private sessionsDir: string;
    private maxSnapshots: number;

    constructor(private workspaceRoot: string) {
        this.sessionsDir = path.join(workspaceRoot, ROBLOXIDE_DIR, SESSIONS_DIR);
        const config = vscode.workspace.getConfiguration('robloxIde.sessions');
        this.maxSnapshots = config.get<number>('maxSnapshots', MAX_SNAPSHOTS);
    }

    /**
     * Create a new snapshot from file changes.
     */
    async createSnapshot(description: string, changes: FileChange[]): Promise<string> {
        await this.ensureDir();

        const id = this.generateId();
        const timestamp = Date.now();

        const storedChanges = changes.map((c) => ({
            filePath: c.filePath,
            diff: computeDiff(c.before, c.after),
            beforeContent: c.before,
        }));

        const snapshot: StoredSnapshot = {
            id,
            timestamp,
            description,
            changes: storedChanges,
        };

        const filePath = path.join(this.sessionsDir, `${id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

        // Prune old snapshots if over limit
        await this.pruneSnapshots();

        return id;
    }

    /**
     * Get a snapshot by ID.
     */
    getSnapshot(id: string): StoredSnapshot | null {
        const filePath = path.join(this.sessionsDir, `${id}.json`);
        if (!fs.existsSync(filePath)) return null;

        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as StoredSnapshot;
    }

    /**
     * List all snapshots (metadata only), sorted by most recent first.
     */
    listSnapshots(): SnapshotMeta[] {
        if (!fs.existsSync(this.sessionsDir)) return [];

        const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
        const metas: SnapshotMeta[] = [];

        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
                const snap = JSON.parse(raw) as StoredSnapshot;
                metas.push({
                    id: snap.id,
                    timestamp: snap.timestamp,
                    description: snap.description,
                    fileCount: snap.changes.length,
                });
            } catch {
                // Skip corrupted files
            }
        }

        return metas.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get the "before" content for each file in a snapshot (for rollback).
     */
    getBeforeContents(id: string): Map<string, string> | null {
        const snapshot = this.getSnapshot(id);
        if (!snapshot) return null;

        const contents = new Map<string, string>();
        for (const change of snapshot.changes) {
            contents.set(change.filePath, change.beforeContent);
        }
        return contents;
    }

    /**
     * Delete a snapshot.
     */
    deleteSnapshot(id: string): void {
        const filePath = path.join(this.sessionsDir, `${id}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    private async pruneSnapshots(): Promise<void> {
        const metas = this.listSnapshots();
        if (metas.length <= this.maxSnapshots) return;

        // Delete oldest snapshots beyond the limit
        const toDelete = metas.slice(this.maxSnapshots);
        for (const meta of toDelete) {
            this.deleteSnapshot(meta.id);
        }
    }

    private async ensureDir(): Promise<void> {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    private generateId(): string {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const random = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${random}`;
    }

    dispose(): void {
        // Nothing to clean up
    }
}
