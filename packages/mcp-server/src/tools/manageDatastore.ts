import { BridgeClient } from '../bridge/bridgeClient.js';

export function manageDatastoreTool(bridge: BridgeClient) {
    return {
        name: 'manage_datastore',
        description: 'Manage Roblox DataStores via Open Cloud API. Supports get, set, delete, list entries, and list datastores.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: { type: 'string', enum: ['get', 'set', 'delete', 'list_entries', 'list_datastores'], description: 'Action to perform.' },
                universeId: { type: 'number', description: 'The Universe ID.' },
                datastoreName: { type: 'string', description: 'DataStore name (not needed for list_datastores).' },
                key: { type: 'string', description: 'Entry key (for get/set/delete).' },
                value: { description: 'Value to set (for set action). Can be any JSON value.' },
                scope: { type: 'string', description: 'DataStore scope. Default: "global".' },
                prefix: { type: 'string', description: 'Filter prefix (for list actions).' },
                limit: { type: 'number', description: 'Max entries to return (for list actions).' },
            },
            required: ['action', 'universeId'],
        },
        handler: async (args: Record<string, unknown>) => {
            try {
                const result = await bridge.manageDatastore(args);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
