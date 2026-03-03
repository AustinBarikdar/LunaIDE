import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { exec } from 'child_process';
import * as os from 'os';
import { getBridgePortFile, INSTRUCTIONS_FILE, LUAU_EXTENSIONS, ROJO_PROJECT_FILE } from '@roblox-ide/shared';
import { SessionManager } from '../sessions/sessionManager.js';
import { LuauClient } from '../luau/luauClient.js';
import { StudioManager } from '../studio/studioManager.js';
import { OpenCloudClient } from '../opencloud/openCloudClient.js';

interface BridgeResponse {
    success: boolean;
    data?: unknown;
    error?: string;
}

/**
 * HTTP bridge server running inside the VS Code extension.
 * The MCP server connects to this to access project data.
 */
export class BridgeServer implements vscode.Disposable {
    private server: http.Server | null = null;
    private port: number = 0;
    private outputChannel: vscode.OutputChannel;
    private workspaceRoot: string;
    private statusBarItem: vscode.StatusBarItem | null = null;

    private routeMap: Record<string, (url: URL, body: Record<string, unknown>) => Promise<BridgeResponse> | BridgeResponse> = {
        'GET /health': () => ({ success: true, data: { status: 'ok', port: this.port } }),
        'POST /scripts/read': (_, body) => this.handleReadScript(body),
        'POST /scripts/write': (_, body) => this.handleWriteScript(body),
        'POST /scripts/search': (_, body) => this.handleSearchFiles(body),
        'GET /project/structure': () => this.handleGetProjectStructure(),
        'GET /project/instructions': () => this.handleGetInstructions(),
        'GET /diagnostics': (url) => this.handleGetDiagnostics(url.searchParams.get('filePath') || undefined),
        'GET /sessions/snapshots': () => this.handleListSnapshots(),
        'POST /sessions/rollback': (_, body) => this.handleRollback(body),
        'GET /instances': () => this.handleListInstances(),
        'GET /instances/properties': (url) => this.handleGetProperties(url.searchParams.get('path') || ''),
        'POST /instances/properties': (_, body) => this.handleSetProperties(body),
        'POST /studio/inject': (_, body) => this.handleInjectScript(body),
        'GET /studio/output': (url) => {
            const since = url.searchParams.get('since');
            return this.handleGetOutput(since ? parseInt(since, 10) : undefined, url.searchParams.get('studioId') || undefined);
        },
        'POST /studio/children': (_, body) => this.handleGetStudioChildren(body),
        'POST /studio/instance-properties': (_, body) => this.handleGetStudioInstanceProperties(body),
        'POST /studio/run-code': (_, body) => this.handleRunCode(body),
        'GET /studio/mode': (url) => this.handleGetStudioMode(url.searchParams.get('studioId') || undefined),
        'POST /studio/start-stop': (_, body) => this.handleStartStopPlay(body),
        'POST /studio/insert-model': (_, body) => this.handleInsertModel(body),
        'POST /studio/run-in-play-mode': (_, body) => this.handleRunScriptInPlayMode(body),
        'GET /studio/connected': () => this.handleGetConnectedStudios(),
        'POST /studio/selection/get': (_, body) => this.handleGetSelection(body),
        'POST /studio/selection/set': (_, body) => this.handleSetSelection(body),
        'POST /studio/create-instance': (_, body) => this.handleCreateInstance(body),
        'POST /studio/delete-instance': (_, body) => this.handleDeleteInstance(body),
        'POST /studio/set-instance-properties': (_, body) => this.handleSetInstanceProperties(body),
        'POST /studio/move-rename-instance': (_, body) => this.handleMoveRenameInstance(body),
        'POST /studio/manage-tags': (_, body) => this.handleManageTags(body),
        'POST /studio/simulate-input': (_, body) => this.handleSimulateInput(body),
        'POST /studio/capture-screenshot': (_, body) => this.handleCaptureScreenshot(body),
        'POST /opencloud/publish': (_, body) => this.handlePublishPlace(body),
        'POST /opencloud/datastore': (_, body) => this.handleDatastore(body),
        'POST /opencloud/message': (_, body) => this.handleSendMessage(body),
    };

    constructor(
        workspaceRoot: string,
        private sessionManager: SessionManager,
        private luauClient: LuauClient,
        private studioManager: StudioManager,
        private openCloudClient: OpenCloudClient,
    ) {
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = vscode.window.createOutputChannel('LunaIDE: Bridge');
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            // Listen on random available port
            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server!.address();
                if (addr && typeof addr === 'object') {
                    this.port = addr.port;
                    this.writePortFile();
                    this.showStatusBar();
                    this.log(`Bridge server listening on port ${this.port}`);
                    resolve();
                } else {
                    reject(new Error('Failed to get server address'));
                }
            });

            this.server.on('error', (err) => {
                this.log(`Bridge server error: ${err.message}`);
                reject(err);
            });
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
        const pathname = url.pathname;
        const method = req.method || 'GET';

        res.setHeader('Content-Type', 'application/json');

        try {
            let body: Record<string, unknown> = {};
            if (method === 'POST') {
                body = await this.readBody(req);
            }

            let result: BridgeResponse;

            // --- Route handling via map ---
            const routeKey = `${method} ${pathname}`;
            const handler = this.routeMap[routeKey];

            if (handler) {
                result = await handler(url, body);
            } else {
                result = { success: false, error: `Unknown route: ${routeKey}` };
                res.statusCode = 404;
            }

            res.end(JSON.stringify(result));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log(`Error handling ${method} ${pathname}: ${message}`);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: message }));
        }
    }

    // --- Script handlers ---

    private async handleReadScript(body: Record<string, unknown>): Promise<BridgeResponse> {
        const filePath = this.resolvePath(body.filePath as string);
        if (!fs.existsSync(filePath)) {
            return { success: false, error: `File not found: ${filePath}` };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, data: content };
    }

    private async handleWriteScript(body: Record<string, unknown>): Promise<BridgeResponse> {
        const filePath = this.resolvePath(body.filePath as string);
        const content = body.content as string;
        const description = (body.description as string) || `Write to ${path.basename(filePath)}`;

        // Snapshot before writing
        await this.sessionManager.snapshotBeforeWrite(filePath, content, description);

        // Write the file
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');

        return { success: true };
    }

    private async handleSearchFiles(body: Record<string, unknown>): Promise<BridgeResponse> {
        const query = body.query as string;
        const isRegex = body.regex as boolean | undefined;
        const includeGlob = body.include as string | undefined;

        const results: Array<{ file: string; line: number; text: string }> = [];
        const pattern = isRegex ? new RegExp(query, 'gm') : null;

        const walkDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.relative(this.workspaceRoot, fullPath);

                // Skip hidden dirs and node_modules
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (!LUAU_EXTENSIONS.includes(ext as any)) continue;
                    if (includeGlob) {
                        // Simple glob matching (just check if path includes the non-wildcard parts)
                        const parts = includeGlob.replace(/\*/g, '').split('/').filter(Boolean);
                        if (parts.length > 0 && !parts.every((p) => relPath.includes(p))) continue;
                    }

                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const match = pattern
                                ? pattern.test(lines[i])
                                : lines[i].includes(query);
                            if (match) {
                                results.push({ file: relPath, line: i + 1, text: lines[i].trim() });
                            }
                            if (pattern) pattern.lastIndex = 0; // Reset regex state
                        }
                    } catch {
                        // Skip unreadable files
                    }
                }
            }
        };

        walkDir(this.workspaceRoot);
        return { success: true, data: results };
    }

    // --- Project handlers ---

    private async handleGetProjectStructure(): Promise<BridgeResponse> {
        const projectFile = path.join(this.workspaceRoot, ROJO_PROJECT_FILE);
        if (!fs.existsSync(projectFile)) {
            return { success: false, error: 'No default.project.json found' };
        }
        const content = fs.readFileSync(projectFile, 'utf-8');
        return { success: true, data: JSON.parse(content) };
    }

    private async handleGetInstructions(): Promise<BridgeResponse> {
        const instructionsPath = path.join(this.workspaceRoot, INSTRUCTIONS_FILE);
        if (!fs.existsSync(instructionsPath)) {
            return { success: true, data: '(No instructions file found. Create .lunaide/instructions.md to add project instructions.)' };
        }
        const content = fs.readFileSync(instructionsPath, 'utf-8');
        return { success: true, data: content };
    }

    // --- Diagnostics handler ---

    private async handleGetDiagnostics(filePath?: string): Promise<BridgeResponse> {
        if (filePath) {
            const resolved = this.resolvePath(filePath);
            const diagnostics = this.luauClient.getDiagnosticsForFile(resolved);
            return { success: true, data: diagnostics };
        }
        const diagnostics = this.luauClient.getAllDiagnostics();
        return { success: true, data: diagnostics };
    }

    // --- Session handlers ---

    private async handleListSnapshots(): Promise<BridgeResponse> {
        const snapshots = this.sessionManager.getStore().listSnapshots();
        return { success: true, data: snapshots };
    }

    private async handleRollback(body: Record<string, unknown>): Promise<BridgeResponse> {
        const snapshotId = body.snapshotId as string;
        await this.sessionManager.rollbackToSnapshot(snapshotId);
        return { success: true };
    }

    // --- Instance handlers ---

    private async handleListInstances(): Promise<BridgeResponse> {
        const projectFile = path.join(this.workspaceRoot, ROJO_PROJECT_FILE);
        if (!fs.existsSync(projectFile)) {
            return { success: false, error: 'No default.project.json found' };
        }
        const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
        // Return the tree (optionally filtered by parentPath in a future iteration)
        return { success: true, data: project.tree || {} };
    }

    private async handleGetProperties(instancePath: string): Promise<BridgeResponse> {
        const projectFile = path.join(this.workspaceRoot, ROJO_PROJECT_FILE);
        if (!fs.existsSync(projectFile)) {
            return { success: false, error: 'No default.project.json found' };
        }
        const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));

        // Navigate the tree by path segments
        const parts = instancePath.split('.').filter(Boolean);
        let node = project.tree;
        for (const part of parts) {
            if (part === 'game' || part === project.name) continue;
            if (node[part]) {
                node = node[part];
            } else {
                return { success: false, error: `Instance not found: ${instancePath}` };
            }
        }

        return {
            success: true,
            data: {
                className: node.$className,
                path: node.$path,
                properties: node.$properties || {},
                ignoreUnknownInstances: node.$ignoreUnknownInstances,
            },
        };
    }

    private async handleSetProperties(body: Record<string, unknown>): Promise<BridgeResponse> {
        const instancePath = body.path as string;
        const properties = body.properties as Record<string, unknown>;
        const projectFile = path.join(this.workspaceRoot, ROJO_PROJECT_FILE);

        if (!fs.existsSync(projectFile)) {
            return { success: false, error: 'No default.project.json found' };
        }

        const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
        const parts = instancePath.split('.').filter(Boolean);
        let node = project.tree;
        for (const part of parts) {
            if (part === 'game' || part === project.name) continue;
            if (node[part]) {
                node = node[part];
            } else {
                return { success: false, error: `Instance not found: ${instancePath}` };
            }
        }

        // Set properties
        if (!node.$properties) node.$properties = {};
        Object.assign(node.$properties, properties);

        // Save back
        await this.sessionManager.snapshotBeforeWrite(
            projectFile,
            JSON.stringify(project, null, 2),
            `Set properties on ${instancePath}`
        );
        fs.writeFileSync(projectFile, JSON.stringify(project, null, 2), 'utf-8');

        return { success: true };
    }

    // --- Studio handlers ---

    private async handleInjectScript(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        try {
            const result = await this.studioManager.sendCommand(studioId, 'inject_script', {
                source: body.source,
                name: body.name,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleGetOutput(sinceTimestamp?: number, studioId?: string): Promise<BridgeResponse> {
        const output = this.studioManager.getOutput(studioId, sinceTimestamp);
        return { success: true, data: output };
    }

    private async handleGetStudioChildren(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        try {
            const result = await this.studioManager.sendCommand(studioId, 'get_children', {
                path: body.path || 'game',
                depth: body.depth || 1,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleGetStudioInstanceProperties(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        try {
            const result = await this.studioManager.sendCommand(studioId, 'get_instance_properties', {
                path: body.path,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    // --- Studio control handlers (merged from Roblox Studio MCP) ---

    private async handleRunCode(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        try {
            const result = await this.studioManager.sendCommand(studioId, 'run_code', {
                command: body.command,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleGetStudioMode(studioId?: string): Promise<BridgeResponse> {
        // When a playtest is running, the plugin runs in both the Edit DataModel and the
        // Server DataModel (each with a different Studio ID). RunService:IsRunning() is
        // always false in Edit, so querying only the first studio always returns "stop".
        // Fix: query all connected studios and return the first non-stop mode.
        const allStudios = this.studioManager.getConnectedStudios();
        if (allStudios.length === 0) {
            return { success: false, error: 'No Studio instance connected' };
        }

        const idsToQuery = studioId ? [studioId] : allStudios.map((s) => s.studioId);

        try {
            const modes = await Promise.all(
                idsToQuery.map((sid) =>
                    this.studioManager
                        .sendCommand(sid, 'get_studio_mode', {})
                        .then((r) => (r as { mode?: string })?.mode || 'stop')
                        .catch(() => 'stop'),
                ),
            );
            const activeMode = modes.find((m) => m !== 'stop');
            return { success: true, data: { mode: activeMode || 'stop' } };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleStartStopPlay(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        const mode = body.mode as string;
        try {
            if (mode === 'stop') {
                const result = await this.studioManager.sendCommand(studioId, 'stop_playtest', {});
                return { success: true, data: result };
            } else if (mode === 'start_play') {
                const result = await this.studioManager.sendCommand(studioId, 'start_playtest', { mode: 'Play' });
                return { success: true, data: result };
            } else if (mode === 'run_server') {
                const result = await this.studioManager.sendCommand(studioId, 'start_playtest', { mode: 'Run' });
                return { success: true, data: result };
            } else {
                return { success: false, error: `Invalid mode: ${mode}. Must be start_play, run_server, or stop.` };
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleInsertModel(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        try {
            const result = await this.studioManager.sendCommand(studioId, 'insert_model', {
                query: body.query,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleRunScriptInPlayMode(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }

        const code = body.code as string;
        const mode = body.mode as string || 'start_play';
        const timeout = (body.timeout as number) || 100;

        try {
            // 1. Start play mode
            const playtestMode = mode === 'run_server' ? 'Run' : 'Play';
            await this.studioManager.sendCommand(studioId, 'start_playtest', { mode: playtestMode });

            // 2. Wait for play to start (poll is_running)
            const startDeadline = Date.now() + 10_000;
            while (Date.now() < startDeadline) {
                await new Promise((r) => setTimeout(r, 500));
                try {
                    const status = await this.studioManager.sendCommand(studioId, 'is_running', {}) as { isRunning: boolean };
                    if (status?.isRunning) break;
                } catch { /* retry */ }
            }

            // 3. Record timestamp before injection
            const beforeTs = Date.now();

            // 4. Inject the script — wrap to signal completion via print
            const wrappedCode = `
local __ok, __err = pcall(function()
${code}
end)
if __ok then
    print("__LUNAIDE_SCRIPT_DONE__")
else
    warn("__LUNAIDE_SCRIPT_ERROR__: " .. tostring(__err))
    print("__LUNAIDE_SCRIPT_DONE__")
end
`;
            await this.studioManager.sendCommand(studioId, 'inject_script', {
                source: wrappedCode,
                name: '_LunaIDE_RunInPlayMode',
            });

            // 5. Poll output for completion or timeout
            const deadline = Date.now() + (timeout * 1000);
            let scriptOutput: string[] = [];
            let scriptError = '';
            let isTimeout = false;
            let doneFound = false;

            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 500));
                const output = this.studioManager.getOutput(studioId, beforeTs);
                const allMessages = output.map((e) => e.message);

                // Check for completion signal
                const doneIdx = allMessages.findIndex((m) => m.includes('__LUNAIDE_SCRIPT_DONE__'));
                if (doneIdx >= 0) {
                    doneFound = true;
                    // Collect all output before done signal
                    for (const entry of output) {
                        if (entry.message.includes('__LUNAIDE_SCRIPT_DONE__')) break;
                        if (entry.message.includes('__LUNAIDE_SCRIPT_ERROR__')) {
                            scriptError = entry.message.replace('__LUNAIDE_SCRIPT_ERROR__: ', '');
                        } else {
                            scriptOutput.push(entry.message);
                        }
                    }
                    break;
                }
            }

            if (!doneFound) {
                isTimeout = true;
                // Collect whatever output we have
                const output = this.studioManager.getOutput(studioId, beforeTs);
                scriptOutput = output
                    .filter((e) => !e.message.includes('__LUNAIDE_SCRIPT_'))
                    .map((e) => e.message);
            }

            // 6. Stop play
            try {
                await this.studioManager.sendCommand(studioId, 'stop_playtest', {});
            } catch { /* best effort */ }

            return {
                success: true,
                data: {
                    success: !scriptError && !isTimeout,
                    value: scriptOutput.join('\n'),
                    error: scriptError || (isTimeout ? 'Script timed out' : ''),
                    logs: scriptOutput.map((m) => ({ level: 'output', message: m, ts: Date.now() })),
                    errors: scriptError ? [{ level: 'error', message: scriptError, ts: Date.now() }] : [],
                    duration: Date.now() - beforeTs,
                    isTimeout,
                },
            };
        } catch (err) {
            // Try to stop play on error
            try {
                await this.studioManager.sendCommand(studioId, 'stop_playtest', {});
            } catch { /* best effort */ }
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    // --- New AI workflow handlers ---

    private async handleGetConnectedStudios(): Promise<BridgeResponse> {
        const studios = this.studioManager.getConnectedStudios();
        return { success: true, data: studios };
    }

    private async handleGetSelection(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'get_selection', {});
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleSetSelection(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'set_selection', {
                paths: body.paths,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleCreateInstance(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'create_instance', {
                className: body.className,
                parentPath: body.parentPath,
                name: body.name,
                properties: body.properties,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleDeleteInstance(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'delete_instance', {
                path: body.path,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleSetInstanceProperties(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'set_instance_properties', {
                path: body.path,
                properties: body.properties,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleMoveRenameInstance(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'move_rename_instance', {
                path: body.path,
                newName: body.newName,
                newParent: body.newParent,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleManageTags(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'manage_tags', {
                action: body.action,
                tag: body.tag,
                path: body.path,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleCaptureScreenshot(body: Record<string, unknown>): Promise<BridgeResponse> {
        const delay = Math.min(Math.max((body.delay as number) || 0, 0), 5);

        try {
            // 1. Find Roblox Studio's largest window using kCGWindowListOptionAll.
            //    This works without Screen Recording permission — it only filters
            //    window *names*, not owner process names.
            const studioWindow = await this.findStudioWindow();
            if (!studioWindow) {
                return { success: false, error: 'Could not find Roblox Studio window. Is Studio open?' };
            }

            // 2. Optional delay before capturing
            if (delay > 0) {
                await new Promise((r) => setTimeout(r, delay * 1000));
            }

            // 3. Prepare output path
            const timestamp = Date.now();
            const captureDir = path.join(this.workspaceRoot, '.lunaide', 'captures');
            if (!fs.existsSync(captureDir)) {
                fs.mkdirSync(captureDir, { recursive: true });
            }
            const filePath = path.join(captureDir, `capture-${timestamp}.png`);

            // 4. Capture the Studio window region by screen coordinates.
            //    -R x,y,w,h: capture only this screen rectangle (more reliable than -l <windowId>)
            //    -x: no shutter sound
            //    Requires Screen Recording permission for LunaIDE in System Settings.
            const { x: winX, y: winY, width: winW, height: winH } = studioWindow.bounds;
            try {
                await this.execPromise(`screencapture -R ${winX},${winY},${winW},${winH} -x "${filePath}"`);
            } catch (captureErr) {
                const msg = captureErr instanceof Error ? captureErr.message : String(captureErr);
                return {
                    success: false,
                    error:
                        `Region capture failed (${msg}). ` +
                        'Grant Screen Recording permission to LunaIDE in ' +
                        'System Settings > Privacy & Security > Screen Recording, then restart LunaIDE.',
                };
            }

            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error:
                        'Capture produced no file. Grant Screen Recording permission to LunaIDE in ' +
                        'System Settings > Privacy & Security > Screen Recording, then restart LunaIDE.',
                };
            }

            // 5. Read as base64 and extract PNG dimensions from header, then delete
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            try { fs.unlinkSync(filePath); } catch { /* best effort */ }

            let width: number | undefined;
            let height: number | undefined;
            if (buffer.length > 24) {
                width = buffer.readUInt32BE(16);
                height = buffer.readUInt32BE(20);
            }

            return { success: true, data: { base64, width, height, timestamp } };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private findStudioWindow(): Promise<{ windowId: string; bounds: { x: number; y: number; width: number; height: number } } | null> {
        // kCGWindowListOptionAll includes every window (on-screen + off-screen).
        // Unlike kCGWindowListOptionOnScreenOnly, it does NOT require Screen Recording
        // permission to return windows from other processes — it only hides the
        // window *title* (kCGWindowName), not the owner process name.
        // We pick the Roblox Studio window with the largest area (the main viewport).
        const swiftCode = `import CoreGraphics
let opts = CGWindowListOption(arrayLiteral: .optionAll)
guard let wins = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { exit(1) }
var bestWid = 0, bestArea = 0, bestX = 0, bestY = 0, bestW = 0, bestH = 0
for w in wins {
    guard (w["kCGWindowOwnerName"] as? String) == "Roblox Studio" else { continue }
    guard let b = w["kCGWindowBounds"] as? [String: Any] else { continue }
    let x = b["X"] as? Int ?? 0, y = b["Y"] as? Int ?? 0
    let width = b["Width"] as? Int ?? 0, height = b["Height"] as? Int ?? 0
    let area = width * height
    if area > bestArea {
        bestArea = area
        bestWid = w["kCGWindowNumber"] as? Int ?? 0
        bestX = x; bestY = y; bestW = width; bestH = height
    }
}
if bestWid > 0 { print("\\(bestWid),\\(bestX),\\(bestY),\\(bestW),\\(bestH)") }`;

        const tmpFile = path.join(os.tmpdir(), `lunaide-wid-${Date.now()}.swift`);

        return new Promise((resolve) => {
            fs.writeFileSync(tmpFile, swiftCode);
            exec(`swift "${tmpFile}"`, (err, stdout) => {
                try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }
                if (err || !stdout.trim()) { resolve(null); return; }
                const parts = stdout.trim().split(',');
                if (parts.length === 5) {
                    resolve({
                        windowId: parts[0],
                        bounds: {
                            x: parseInt(parts[1], 10),
                            y: parseInt(parts[2], 10),
                            width: parseInt(parts[3], 10),
                            height: parseInt(parts[4], 10),
                        },
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    private execPromise(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`Command failed: ${err.message}${stderr ? '\n' + stderr : ''}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    private async handleSimulateInput(body: Record<string, unknown>): Promise<BridgeResponse> {
        const studioId = (body.studioId as string) || this.studioManager.getFirstStudioId();
        if (!studioId) {
            return { success: false, error: 'No Studio instance connected' };
        }
        try {
            const result = await this.studioManager.sendCommand(studioId, 'simulate_input', {
                action: body.action,
                key: body.key,
                x: body.x,
                y: body.y,
            });
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    // --- OpenCloud handlers ---

    private async handlePublishPlace(body: Record<string, unknown>): Promise<BridgeResponse> {
        try {
            const filePath = this.resolvePath(body.filePath as string);
            if (!fs.existsSync(filePath)) {
                return { success: false, error: `File not found: ${filePath}` };
            }
            const content = fs.readFileSync(filePath);
            const result = await this.openCloudClient.publishPlace(
                body.universeId as number,
                body.placeId as number,
                content,
                (body.versionType as any) || 'Published'
            );
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleDatastore(body: Record<string, unknown>): Promise<BridgeResponse> {
        const action = body.action as string;
        const universeId = body.universeId as number;
        try {
            let result: unknown;
            switch (action) {
                case 'list_datastores':
                    result = await this.openCloudClient.listDataStores(universeId, body.prefix as string, body.limit as number);
                    break;
                case 'list_entries':
                    result = await this.openCloudClient.listDataStoreEntries(universeId, body.datastoreName as string, body.prefix as string, body.limit as number, body.scope as string);
                    break;
                case 'get':
                    result = await this.openCloudClient.getDataStoreEntry(universeId, body.datastoreName as string, body.key as string, body.scope as string);
                    break;
                case 'set':
                    result = await this.openCloudClient.setDataStoreEntry(universeId, body.datastoreName as string, body.key as string, body.value, body.scope as string);
                    break;
                case 'delete':
                    await this.openCloudClient.deleteDataStoreEntry(universeId, body.datastoreName as string, body.key as string, body.scope as string);
                    result = { deleted: true };
                    break;
                default:
                    return { success: false, error: `Unknown datastore action: ${action}` };
            }
            return { success: true, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    private async handleSendMessage(body: Record<string, unknown>): Promise<BridgeResponse> {
        try {
            await this.openCloudClient.publishMessage(
                body.universeId as number,
                body.topic as string,
                body.message as string
            );
            return { success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    }

    // --- Utilities ---

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) return filePath;
        return path.join(this.workspaceRoot, filePath);
    }

    private showStatusBar(): void {
        if (!this.statusBarItem) {
            // Priority 99 places it right next to the Rojo item (priority 100)
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        }
        this.statusBarItem.text = '$(radio-tower) Bridge';
        this.statusBarItem.tooltip = `LunaIDE Bridge Server — port ${this.port}`;
        this.statusBarItem.show();
    }

    private writePortFile(): void {
        fs.writeFileSync(getBridgePortFile(this.workspaceRoot), String(this.port), 'utf-8');
    }

    private removePortFile(): void {
        const portFilePath = getBridgePortFile(this.workspaceRoot);
        if (fs.existsSync(portFilePath)) {
            fs.unlinkSync(portFilePath);
        }
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
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

    dispose(): void {
        this.removePortFile();
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.statusBarItem?.dispose();
        this.outputChannel.dispose();
    }
}
