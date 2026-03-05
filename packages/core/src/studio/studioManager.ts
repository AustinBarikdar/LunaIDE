import * as vscode from 'vscode';
import { StudioCommand, StudioCommandType, StudioOutputEntry, StudioInstanceNode } from '@roblox-ide/shared';

interface ConnectedStudio {
    studioId: string;
    version: string;
    placeId?: number;
    placeName?: string;
    connectedAt: number;
    lastSeen: number;
    outputBuffer: StudioOutputEntry[];
    commandQueue: StudioCommand[];
    pendingResults: Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>;
    instanceTree?: StudioInstanceNode;
}

/**
 * Manages connected Roblox Studio instances.
 * Stores output buffers, command queues, and instance trees per Studio.
 */
export class StudioManager implements vscode.Disposable {
    private studios: Map<string, ConnectedStudio> = new Map();
    private outputChannel: vscode.OutputChannel;
    private maxOutputBuffer = 2000;
    private commandTimeout = 30_000; // 30 seconds
    private staleTimeout = 60_000; // 60 seconds — remove studios that haven't polled
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('LunaIDE: Studio');
        // Periodically prune stale studio sessions
        this.cleanupTimer = setInterval(() => this.pruneStale(), 30_000);
    }

    /** Remove studios that haven't polled within the stale timeout. */
    private pruneStale(): void {
        const now = Date.now();
        for (const [id, studio] of this.studios) {
            if (now - studio.lastSeen > this.staleTimeout) {
                // Reject any pending commands
                for (const [cmdId, pending] of studio.pendingResults) {
                    pending.reject(new Error('Studio disconnected (stale)'));
                }
                this.studios.delete(id);
                this.log(`Pruned stale studio: ${id} (last seen ${Math.round((now - studio.lastSeen) / 1000)}s ago)`);
            }
        }
    }

    // --- Studio lifecycle ---

    registerStudio(studioId: string, version: string, placeId?: number, placeName?: string): void {
        // Prune stale sessions on each handshake
        this.pruneStale();

        const existing = this.studios.get(studioId);
        if (existing) {
            existing.lastSeen = Date.now();
            existing.version = version;
            this.log(`Studio reconnected: ${studioId}`);
            return;
        }

        this.studios.set(studioId, {
            studioId,
            version,
            placeId,
            placeName,
            connectedAt: Date.now(),
            lastSeen: Date.now(),
            outputBuffer: [],
            commandQueue: [],
            pendingResults: new Map(),
        });

        this.log(`Studio connected: ${studioId} (${placeName || 'Unknown'}, place ${placeId || 'N/A'})`);
    }

    getConnectedStudios(): Array<{ studioId: string; placeName?: string; placeId?: number }> {
        return Array.from(this.studios.values()).map((s) => ({
            studioId: s.studioId,
            placeName: s.placeName,
            placeId: s.placeId,
        }));
    }

    // --- Output ---

    addOutput(studioId: string, entries: StudioOutputEntry[]): void {
        const studio = this.studios.get(studioId);
        if (!studio) return;

        studio.lastSeen = Date.now();
        studio.outputBuffer.push(...entries);

        // Trim buffer
        if (studio.outputBuffer.length > this.maxOutputBuffer) {
            studio.outputBuffer = studio.outputBuffer.slice(-this.maxOutputBuffer);
        }

        // Log errors to output channel
        for (const entry of entries) {
            if (entry.messageType === 'MessageError' || entry.messageType === 'MessageWarning') {
                this.log(`[${entry.messageType}] ${entry.message}`);
            }
        }
    }

    getOutput(studioId?: string, sinceTimestamp?: number): StudioOutputEntry[] {
        if (studioId) {
            const studio = this.studios.get(studioId);
            if (!studio) return [];
            const entries = studio.outputBuffer;
            if (sinceTimestamp) {
                return entries.filter((e) => e.timestamp > sinceTimestamp);
            }
            return entries;
        }

        // All studios
        const all: StudioOutputEntry[] = [];
        for (const studio of this.studios.values()) {
            all.push(...studio.outputBuffer);
        }
        all.sort((a, b) => a.timestamp - b.timestamp);
        if (sinceTimestamp) {
            return all.filter((e) => e.timestamp > sinceTimestamp);
        }
        return all;
    }

    // --- Commands ---

    async sendCommand(studioId: string, type: StudioCommandType, payload: Record<string, unknown> = {}): Promise<unknown> {
        const studio = this.studios.get(studioId);
        if (!studio) {
            throw new Error(`Studio not connected: ${studioId}`);
        }

        const id = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const command: StudioCommand = { id, type, payload };
        studio.commandQueue.push(command);

        // Wait for result with timeout
        return new Promise((resolve, reject) => {
            studio.pendingResults.set(id, { resolve, reject });

            setTimeout(() => {
                if (studio.pendingResults.has(id)) {
                    studio.pendingResults.delete(id);
                    reject(new Error(`Command timed out: ${type} (${id})`));
                }
            }, this.commandTimeout);
        });
    }

    getPendingCommands(studioId: string): StudioCommand[] {
        const studio = this.studios.get(studioId);
        if (!studio) return [];

        studio.lastSeen = Date.now();
        const commands = studio.commandQueue;
        studio.commandQueue = [];
        return commands;
    }

    handleCommandResult(commandId: string, success: boolean, data?: unknown, error?: string): void {
        for (const studio of this.studios.values()) {
            const pending = studio.pendingResults.get(commandId);
            if (pending) {
                studio.pendingResults.delete(commandId);
                if (success) {
                    pending.resolve(data);
                } else {
                    pending.reject(new Error(error || 'Command failed'));
                }
                return;
            }
        }
    }

    // --- Instance tree ---

    updateInstanceTree(studioId: string, root: StudioInstanceNode): void {
        const studio = this.studios.get(studioId);
        if (!studio) return;

        studio.lastSeen = Date.now();
        studio.instanceTree = root;
    }

    // --- Helpers ---

    getFirstStudioId(): string | null {
        const first = this.studios.values().next();
        return first.done ? null : first.value.studioId;
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.studios.clear();
        this.outputChannel.dispose();
    }
}
