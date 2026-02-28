import { BridgeClient } from '../bridge/bridgeClient.js';

export function getInstancePropertiesTool(bridge: BridgeClient) {
    return {
        name: 'get_instance_properties',
        description: 'Get detailed properties, attributes, and tags of a specific Roblox instance from the live Studio DataModel. Returns class-specific properties (e.g., Position/Size for BasePart, Source for scripts, Value for ValueBase objects).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Dot-separated instance path, e.g. "game.Workspace.SpawnLocation" or "game.ServerScriptService.MainScript".',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['path'],
        },
        handler: async (args: { path: string; studioId?: string }) => {
            try {
                const result = await bridge.getStudioInstanceProperties(args.path, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
