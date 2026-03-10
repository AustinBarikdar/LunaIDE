import * as vscode from 'vscode';
import * as http from 'http';
import { STUDIO_BRIDGE_PORT } from '@roblox-ide/shared';
import { StudioManager } from './studioManager.js';

/**
 * HTTP server accepting connections from the Roblox Studio plugin.
 * Runs on port 21026 by default.
 * 
 * Routes:
 *   POST /studio/handshake   — Studio registers itself
 *   GET  /studio/commands    — Studio polls for pending commands
 *   POST /studio/results     — Studio posts command results
 *   POST /studio/output      — Studio posts output log entries
 *   POST /studio/instances   — Studio posts instance tree
 */
export class StudioHttpServer implements vscode.Disposable {
    private server: http.Server | null = null;
    private outputChannel: vscode.OutputChannel;

    constructor(private studioManager: StudioManager) {
        this.outputChannel = vscode.window.createOutputChannel('LunaIDE: Studio Server');
    }

    async start(): Promise<void> {
        const port = vscode.workspace.getConfiguration('robloxIde.studio').get<number>('bridgePort', STUDIO_BRIDGE_PORT);

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                void this.handleRequest(req, res).catch((err) => {
                    this.log(`Unhandled request error: ${err instanceof Error ? err.message : String(err)}`);
                    if (!res.headersSent) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
                    }
                });
            });

            this.server.listen(port, '127.0.0.1', () => {
                this.log(`Studio server listening on port ${port}`);
                resolve();
            });

            this.server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    this.log(`Port ${port} is already in use — Studio server may already be running`);
                    this.server = null; // Clear failed server reference to prevent dispose() from throwing
                    resolve(); // Non-fatal
                } else {
                    this.log(`Studio server error: ${err.message}`);
                    reject(err);
                }
            });
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const url = new URL(req.url || '/', `http://127.0.0.1`);
        const pathname = url.pathname;
        const method = req.method || 'GET';

        // CORS headers for Studio's HttpService
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
        }

        try {
            let body: Record<string, unknown> = {};
            if (method === 'POST') {
                body = await this.readBody(req);
            }

            let result: Record<string, unknown>;

            if (method === 'POST' && pathname === '/studio/handshake') {
                result = this.handleHandshake(body);
            }
            else if (method === 'GET' && pathname === '/studio/commands') {
                const studioId = url.searchParams.get('studioId') || '';
                result = this.handleGetCommands(studioId);
            }
            else if (method === 'POST' && pathname === '/studio/results') {
                result = this.handleResult(body);
            }
            else if (method === 'POST' && pathname === '/studio/output') {
                result = this.handleOutput(body);
            }
            else if (method === 'POST' && pathname === '/studio/instances') {
                result = this.handleInstances(body);
            }
            else {
                res.statusCode = 404;
                result = { success: false, error: 'Not found' };
            }

            res.end(JSON.stringify(result));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log(`Error: ${method} ${pathname}: ${message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: message }));
        }
    }

    private handleHandshake(body: Record<string, unknown>): Record<string, unknown> {
        const studioId = body.studioId as string;
        const version = body.version as string;
        const placeId = body.placeId as number | undefined;
        const placeName = body.placeName as string | undefined;

        if (!studioId) {
            return { success: false, error: 'Missing studioId' };
        }

        this.studioManager.registerStudio(studioId, version, placeId, placeName);
        return { success: true };
    }

    private handleGetCommands(studioId: string): Record<string, unknown> {
        if (!studioId) {
            return { success: false, error: 'Missing studioId', commands: [] };
        }
        const commands = this.studioManager.getPendingCommands(studioId);
        return { success: true, commands };
    }

    private handleResult(body: Record<string, unknown>): Record<string, unknown> {
        const commandId = body.commandId as string;
        const success = body.success as boolean;
        const data = body.data;
        const error = body.error as string | undefined;

        if (!commandId) {
            return { success: false, error: 'Missing commandId' };
        }

        this.studioManager.handleCommandResult(commandId, success, data, error);
        return { success: true };
    }

    private handleOutput(body: Record<string, unknown>): Record<string, unknown> {
        const studioId = body.studioId as string;
        const entries = body.entries as Array<{ timestamp: number; messageType: string; message: string }>;

        if (!studioId || !entries) {
            return { success: false, error: 'Missing studioId or entries' };
        }

        this.studioManager.addOutput(studioId, entries.map((e) => ({
            timestamp: e.timestamp,
            messageType: e.messageType as any,
            message: e.message,
        })));

        return { success: true };
    }

    private handleInstances(body: Record<string, unknown>): Record<string, unknown> {
        const studioId = body.studioId as string;
        const root = body.root as any;

        if (!studioId || !root) {
            return { success: false, error: 'Missing studioId or root' };
        }

        this.studioManager.updateInstanceTree(studioId, root);
        return { success: true };
    }

    private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
        const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let size = 0;
            req.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BODY_SIZE) {
                    req.destroy();
                    reject(new Error('Request body too large'));
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                try {
                    const text = Buffer.concat(chunks).toString('utf-8');
                    resolve(text ? JSON.parse(text) : {});
                } catch (err) {
                    reject(err);
                }
            });
            req.on('error', reject);
        });
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    dispose(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.outputChannel.dispose();
    }
}
