import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
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

            // --- Routes ---
            if (method === 'GET' && pathname === '/health') {
                result = { success: true, data: { status: 'ok', port: this.port } };
            }
            // Scripts
            else if (method === 'POST' && pathname === '/scripts/read') {
                result = await this.handleReadScript(body);
            }
            else if (method === 'POST' && pathname === '/scripts/write') {
                result = await this.handleWriteScript(body);
            }
            else if (method === 'POST' && pathname === '/scripts/search') {
                result = await this.handleSearchFiles(body);
            }
            // Project
            else if (method === 'GET' && pathname === '/project/structure') {
                result = await this.handleGetProjectStructure();
            }
            else if (method === 'GET' && pathname === '/project/instructions') {
                result = await this.handleGetInstructions();
            }
            // Diagnostics
            else if (method === 'GET' && pathname === '/diagnostics') {
                const filePath = url.searchParams.get('filePath') || undefined;
                result = await this.handleGetDiagnostics(filePath);
            }
            // Sessions
            else if (method === 'GET' && pathname === '/sessions/snapshots') {
                result = await this.handleListSnapshots();
            }
            else if (method === 'POST' && pathname === '/sessions/rollback') {
                result = await this.handleRollback(body);
            }
            // Instances
            else if (method === 'GET' && pathname === '/instances') {
                result = await this.handleListInstances();
            }
            else if (method === 'GET' && pathname === '/instances/properties') {
                const instancePath = url.searchParams.get('path') || '';
                result = await this.handleGetProperties(instancePath);
            }
            else if (method === 'POST' && pathname === '/instances/properties') {
                result = await this.handleSetProperties(body);
            }
            // Studio (MCP -> bridge -> StudioManager -> Studio plugin)
            else if (method === 'POST' && pathname === '/studio/inject') {
                result = await this.handleInjectScript(body);
            }
            else if (method === 'GET' && pathname === '/studio/output') {
                const since = url.searchParams.get('since');
                const studioId = url.searchParams.get('studioId') || undefined;
                result = await this.handleGetOutput(since ? parseInt(since, 10) : undefined, studioId);
            }
            else if (method === 'POST' && pathname === '/studio/children') {
                result = await this.handleGetStudioChildren(body);
            }
            else if (method === 'POST' && pathname === '/studio/instance-properties') {
                result = await this.handleGetStudioInstanceProperties(body);
            }
            // Studio control tools (merged from Roblox Studio MCP)
            else if (method === 'POST' && pathname === '/studio/run-code') {
                result = await this.handleRunCode(body);
            }
            else if (method === 'GET' && pathname === '/studio/mode') {
                const studioId = url.searchParams.get('studioId') || undefined;
                result = await this.handleGetStudioMode(studioId);
            }
            else if (method === 'POST' && pathname === '/studio/start-stop') {
                result = await this.handleStartStopPlay(body);
            }
            else if (method === 'POST' && pathname === '/studio/insert-model') {
                result = await this.handleInsertModel(body);
            }
            else if (method === 'POST' && pathname === '/studio/run-in-play-mode') {
                result = await this.handleRunScriptInPlayMode(body);
            }
            // New AI workflow routes
            else if (method === 'GET' && pathname === '/studio/connected') {
                result = await this.handleGetConnectedStudios();
            }
            else if (method === 'POST' && pathname === '/studio/selection/get') {
                result = await this.handleGetSelection(body);
            }
            else if (method === 'POST' && pathname === '/studio/selection/set') {
                result = await this.handleSetSelection(body);
            }
            else if (method === 'POST' && pathname === '/studio/create-instance') {
                result = await this.handleCreateInstance(body);
            }
            else if (method === 'POST' && pathname === '/studio/delete-instance') {
                result = await this.handleDeleteInstance(body);
            }
            else if (method === 'POST' && pathname === '/studio/set-instance-properties') {
                result = await this.handleSetInstanceProperties(body);
            }
            else if (method === 'POST' && pathname === '/studio/move-rename-instance') {
                result = await this.handleMoveRenameInstance(body);
            }
            else if (method === 'POST' && pathname === '/studio/manage-tags') {
                result = await this.handleManageTags(body);
            }
            // OpenCloud
            else if (method === 'POST' && pathname === '/opencloud/publish') {
                result = await this.handlePublishPlace(body);
            }
            else if (method === 'POST' && pathname === '/opencloud/datastore') {
                result = await this.handleDatastore(body);
            }
            else if (method === 'POST' && pathname === '/opencloud/message') {
                result = await this.handleSendMessage(body);
            }
            else {
                result = { success: false, error: `Unknown route: ${method} ${pathname}` };
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
        const id = studioId || this.studioManager.getFirstStudioId();
        if (!id) {
            return { success: false, error: 'No Studio instance connected' };
        }

        try {
            const result = await this.studioManager.sendCommand(id, 'get_studio_mode', {});
            return { success: true, data: result };
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

            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 500));
                const output = this.studioManager.getOutput(studioId, beforeTs);
                const allMessages = output.map((e) => e.message);

                // Check for completion signal
                const doneIdx = allMessages.findIndex((m) => m.includes('__LUNAIDE_SCRIPT_DONE__'));
                if (doneIdx >= 0) {
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

            if (Date.now() >= deadline) {
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
