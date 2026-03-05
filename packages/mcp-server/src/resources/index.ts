import { BridgeClient } from '../bridge/bridgeClient.js';
import { uiReferenceResource } from './uiReference.js';
import { luauReferenceResource } from './luauReference.js';

export interface ResourceDefinition {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
    handler: () => Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;
}

/**
 * Create all MCP resource definitions bound to a bridge client.
 */
export function createResources(bridge: BridgeClient): ResourceDefinition[] {
    return [
        {
            uri: 'roblox://project/structure',
            name: 'Project Structure',
            description: 'The Rojo project tree showing how files map to Roblox instances',
            mimeType: 'application/json',
            handler: async () => {
                try {
                    const structure = await bridge.getProjectStructure();
                    return {
                        contents: [{
                            uri: 'roblox://project/structure',
                            mimeType: 'application/json',
                            text: JSON.stringify(structure, null, 2),
                        }],
                    };
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return {
                        contents: [{
                            uri: 'roblox://project/structure',
                            mimeType: 'text/plain',
                            text: `Error: ${message}`,
                        }],
                    };
                }
            },
        },

        {
            uri: 'roblox://project/instructions',
            name: 'Project Instructions',
            description: 'Persistent project instructions from .lunaide/instructions.md',
            mimeType: 'text/markdown',
            handler: async () => {
                try {
                    const instructions = await bridge.getInstructions();
                    return {
                        contents: [{
                            uri: 'roblox://project/instructions',
                            mimeType: 'text/markdown',
                            text: instructions,
                        }],
                    };
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return {
                        contents: [{
                            uri: 'roblox://project/instructions',
                            mimeType: 'text/plain',
                            text: `Error: ${message}`,
                        }],
                    };
                }
            },
        },

        {
            uri: 'roblox://diagnostics/all',
            name: 'All Diagnostics',
            description: 'All current Luau LSP diagnostics (errors, warnings, etc.)',
            mimeType: 'application/json',
            handler: async () => {
                try {
                    const diagnostics = await bridge.getDiagnostics();
                    return {
                        contents: [{
                            uri: 'roblox://diagnostics/all',
                            mimeType: 'application/json',
                            text: JSON.stringify(diagnostics, null, 2),
                        }],
                    };
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return {
                        contents: [{
                            uri: 'roblox://diagnostics/all',
                            mimeType: 'text/plain',
                            text: `Error: ${message}`,
                        }],
                    };
                }
            },
        },

        uiReferenceResource(),
        luauReferenceResource(),
    ];
}
