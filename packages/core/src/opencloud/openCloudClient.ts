import * as vscode from 'vscode';

const OPENCLOUD_BASE = 'https://apis.roblox.com';
const RATE_LIMIT_PER_MIN = 45;

/**
 * Base HTTP client for Roblox Open Cloud APIs.
 * API key is stored securely via VS Code SecretStorage.
 * Includes rate limiting (45 req/min).
 */
export class OpenCloudClient implements vscode.Disposable {
    private apiKey: string | null = null;
    private requestTimestamps: number[] = [];
    private outputChannel: vscode.OutputChannel;
    private secrets: vscode.SecretStorage;

    constructor(context: vscode.ExtensionContext) {
        this.secrets = context.secrets;
        this.outputChannel = vscode.window.createOutputChannel('LunaIDE: OpenCloud');
    }

    async initialize(): Promise<void> {
        this.apiKey = await this.secrets.get('robloxIde.openCloudApiKey') || null;
        if (this.apiKey) {
            this.log('API key loaded from secret storage.');
        }
    }

    async setApiKey(key: string): Promise<void> {
        await this.secrets.store('robloxIde.openCloudApiKey', key);
        this.apiKey = key;
        this.log('API key saved to secret storage.');
    }

    async clearApiKey(): Promise<void> {
        await this.secrets.delete('robloxIde.openCloudApiKey');
        this.apiKey = null;
        this.log('API key cleared.');
    }

    hasApiKey(): boolean {
        return this.apiKey !== null;
    }

    // --- Place API ---

    async publishPlace(universeId: number, placeId: number, fileContent: Buffer, versionType: 'Saved' | 'Published' = 'Published'): Promise<{ versionNumber: number }> {
        this.ensureApiKey();
        const resp = await this.request(
            'POST',
            `/universes/v1/${universeId}/places/${placeId}/versions?versionType=${versionType}`,
            fileContent,
            'application/octet-stream'
        );
        return resp as { versionNumber: number };
    }

    // --- DataStore API ---

    async listDataStores(universeId: number, prefix?: string, limit?: number): Promise<unknown> {
        this.ensureApiKey();
        const params = new URLSearchParams();
        if (prefix) params.set('prefix', prefix);
        if (limit) params.set('limit', String(limit));
        const query = params.toString();
        return this.request('GET', `/datastores/v1/universes/${universeId}/standard-datastores?${query}`);
    }

    async getDataStoreEntry(universeId: number, datastoreName: string, key: string, scope?: string): Promise<unknown> {
        this.ensureApiKey();
        const scopeStr = scope || 'global';
        return this.request(
            'GET',
            `/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(datastoreName)}&entryKey=${encodeURIComponent(key)}&scope=${scopeStr}`
        );
    }

    async setDataStoreEntry(universeId: number, datastoreName: string, key: string, value: unknown, scope?: string): Promise<unknown> {
        this.ensureApiKey();
        const scopeStr = scope || 'global';
        return this.request(
            'POST',
            `/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(datastoreName)}&entryKey=${encodeURIComponent(key)}&scope=${scopeStr}`,
            JSON.stringify(value),
            'application/json'
        );
    }

    async deleteDataStoreEntry(universeId: number, datastoreName: string, key: string, scope?: string): Promise<void> {
        this.ensureApiKey();
        const scopeStr = scope || 'global';
        await this.request(
            'DELETE',
            `/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(datastoreName)}&entryKey=${encodeURIComponent(key)}&scope=${scopeStr}`
        );
    }

    async listDataStoreEntries(universeId: number, datastoreName: string, prefix?: string, limit?: number, scope?: string): Promise<unknown> {
        this.ensureApiKey();
        const params = new URLSearchParams();
        if (prefix) params.set('prefix', prefix);
        if (limit) params.set('limit', String(limit));
        params.set('scope', scope || 'global');
        const query = params.toString();
        return this.request(
            'GET',
            `/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries?datastoreName=${encodeURIComponent(datastoreName)}&${query}`
        );
    }

    // --- Messaging API ---

    async publishMessage(universeId: number, topic: string, message: string): Promise<void> {
        this.ensureApiKey();
        await this.request(
            'POST',
            `/messaging-service/v1/universes/${universeId}/topics/${encodeURIComponent(topic)}`,
            JSON.stringify({ message }),
            'application/json'
        );
    }

    // --- Internal ---

    private ensureApiKey(): void {
        if (!this.apiKey) {
            throw new Error(
                'No Open Cloud API key configured. ' +
                'Run "LunaIDE: Set Open Cloud API Key" command first.'
            );
        }
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        // Remove timestamps older than 1 minute
        this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60_000);

        if (this.requestTimestamps.length >= RATE_LIMIT_PER_MIN) {
            const oldest = this.requestTimestamps[0];
            const waitMs = 60_000 - (now - oldest) + 100;
            this.log(`Rate limited — waiting ${Math.ceil(waitMs / 1000)}s`);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.requestTimestamps.push(Date.now());
    }

    private async request(method: string, endpoint: string, body?: string | Buffer, contentType?: string): Promise<unknown> {
        await this.waitForRateLimit();

        const url = `${OPENCLOUD_BASE}${endpoint}`;
        const headers: Record<string, string> = {
            'x-api-key': this.apiKey!,
        };
        if (contentType) {
            headers['Content-Type'] = contentType;
        }

        const options: RequestInit = { method, headers };
        if (body) {
            options.body = body;
        }

        this.log(`${method} ${endpoint}`);

        const resp = await fetch(url, options);
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Open Cloud API error (${resp.status}): ${text}`);
        }

        const responseText = await resp.text();
        if (!responseText) return {};

        try {
            return JSON.parse(responseText);
        } catch {
            return responseText;
        }
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
