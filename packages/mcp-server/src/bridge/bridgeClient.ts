import * as fs from 'fs';
import { getBridgePortFile } from '@roblox-ide/shared';

interface BridgeResponse {
    success: boolean;
    data?: unknown;
    error?: string;
}

/**
 * HTTP client for communicating with the VS Code extension bridge server.
 * The bridge server runs inside the extension and exposes project data/actions
 * to the MCP server process.
 */
export class BridgeClient {
    private baseUrl: string | null = null;
    private workspacePath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
    }

    async connect(): Promise<void> {
        const portFile = getBridgePortFile(this.workspacePath);
        if (!fs.existsSync(portFile)) {
            throw new Error(
                `Bridge port file not found at ${portFile}. Is the LunaIDE extension running?`
            );
        }
        const port = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
        if (isNaN(port)) {
            throw new Error(`Invalid port in ${portFile}`);
        }
        this.baseUrl = `http://127.0.0.1:${port}`;

        // Verify connection
        const resp = await this.request('GET', '/health');
        if (!resp.ok) {
            throw new Error('Bridge server health check failed');
        }
    }

    isConnected(): boolean {
        return this.baseUrl !== null;
    }

    // --- Script operations ---

    async readScript(filePath: string): Promise<string> {
        const data = await this.jsonRequest('POST', '/scripts/read', { filePath });
        return data.data as string;
    }

    async writeScript(filePath: string, content: string, description?: string): Promise<void> {
        await this.jsonRequest('POST', '/scripts/write', { filePath, content, description });
    }

    async searchFiles(query: string, options?: { regex?: boolean; include?: string }): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/scripts/search', { query, ...options });
        return data.data;
    }

    // --- Project operations ---

    async getProjectStructure(): Promise<unknown> {
        const data = await this.jsonRequest('GET', '/project/structure');
        return data.data;
    }

    async getInstructions(): Promise<string> {
        const data = await this.jsonRequest('GET', '/project/instructions');
        return data.data as string;
    }

    // --- Diagnostics ---

    async getDiagnostics(filePath?: string): Promise<unknown> {
        const params = filePath ? `?filePath=${encodeURIComponent(filePath)}` : '';
        const data = await this.jsonRequest('GET', `/diagnostics${params}`);
        return data.data;
    }

    // --- Session operations ---

    async getSnapshots(): Promise<unknown> {
        const data = await this.jsonRequest('GET', '/sessions/snapshots');
        return data.data;
    }

    async rollbackToSnapshot(snapshotId: string): Promise<void> {
        await this.jsonRequest('POST', '/sessions/rollback', { snapshotId });
    }

    // --- Instance operations ---

    async listInstances(parentPath?: string): Promise<unknown> {
        const params = parentPath ? `?parentPath=${encodeURIComponent(parentPath)}` : '';
        const data = await this.jsonRequest('GET', `/instances${params}`);
        return data.data;
    }

    async getProperties(instancePath: string): Promise<unknown> {
        const data = await this.jsonRequest('GET', `/instances/properties?path=${encodeURIComponent(instancePath)}`);
        return data.data;
    }

    async setProperties(instancePath: string, properties: Record<string, unknown>): Promise<void> {
        await this.jsonRequest('POST', '/instances/properties', { path: instancePath, properties });
    }

    // --- Studio operations ---

    async injectScript(source: string, name?: string, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/inject', { source, name, studioId });
        return data.data;
    }

    async getOutput(sinceTimestamp?: number, studioId?: string): Promise<unknown> {
        const params = new URLSearchParams();
        if (sinceTimestamp) params.set('since', String(sinceTimestamp));
        if (studioId) params.set('studioId', studioId);
        const query = params.toString();
        const data = await this.jsonRequest('GET', `/studio/output${query ? '?' + query : ''}`);
        return data.data;
    }

    async getStudioChildren(path?: string, depth?: number, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/children', { path, depth, studioId });
        return data.data;
    }

    async getStudioInstanceProperties(path: string, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/instance-properties', { path, studioId });
        return data.data;
    }

    // --- Studio control operations (merged from Roblox Studio MCP) ---

    async runCode(command: string, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/run-code', { command, studioId });
        return data.data;
    }

    async getStudioMode(studioId?: string): Promise<unknown> {
        const params = studioId ? `?studioId=${encodeURIComponent(studioId)}` : '';
        const data = await this.jsonRequest('GET', `/studio/mode${params}`);
        return data.data;
    }

    async startStopPlay(mode: string, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/start-stop', { mode, studioId });
        return data.data;
    }

    async insertModel(query: string, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/insert-model', { query, studioId });
        return data.data;
    }

    async runScriptInPlayMode(code: string, mode: string, timeout?: number, studioId?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/studio/run-in-play-mode', { code, mode, timeout, studioId });
        return data.data;
    }

    // --- OpenCloud operations ---

    async publishPlace(universeId: number, placeId: number, filePath: string, versionType?: string): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/opencloud/publish', { universeId, placeId, filePath, versionType });
        return data.data;
    }

    async manageDatastore(params: Record<string, unknown>): Promise<unknown> {
        const data = await this.jsonRequest('POST', '/opencloud/datastore', params);
        return data.data;
    }

    async sendMessage(universeId: number, topic: string, message: string): Promise<void> {
        await this.jsonRequest('POST', '/opencloud/message', { universeId, topic, message });
    }

    // --- Internal HTTP ---

    private async jsonRequest(method: string, endpoint: string, body?: unknown): Promise<BridgeResponse> {
        const resp = await this.request(method, endpoint, body);
        const data = await resp.json() as BridgeResponse;
        if (!data.success) {
            throw new Error(data.error || `Request failed: ${method} ${endpoint}`);
        }
        return data;
    }

    private async request(method: string, endpoint: string, body?: unknown): Promise<Response> {
        if (!this.baseUrl) {
            throw new Error('Bridge client not connected. Call connect() first.');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const options: RequestInit = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        return fetch(url, options);
    }
}
