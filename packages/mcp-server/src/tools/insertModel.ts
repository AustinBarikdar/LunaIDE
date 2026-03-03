import { BridgeClient } from '../bridge/bridgeClient.js';

export function insertModelTool(bridge: BridgeClient) {
    return {
        name: 'insert_model',
        description: 'Inserts a model from the Roblox marketplace into the workspace. Returns the inserted model name.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description: 'Query to search for the model',
                },
            },
            required: ['query'],
        },
        handler: async (args: { query: string }) => {
            try {
                const result = await bridge.insertModel(args.query);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
