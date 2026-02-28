import { BridgeClient } from '../bridge/bridgeClient.js';

export function listInstancesTool(bridge: BridgeClient) {
    return {
        name: 'list_instances',
        description: 'List Roblox game instances from the Rojo project tree. Optionally filter by parent path.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                parentPath: {
                    type: 'string',
                    description: 'Optional instance path to list children of (e.g. "game.ServerScriptService")',
                },
            },
        },
        handler: async (args: { parentPath?: string }) => {
            try {
                const instances = await bridge.listInstances(args.parentPath);
                return { content: [{ type: 'text' as const, text: JSON.stringify(instances, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
