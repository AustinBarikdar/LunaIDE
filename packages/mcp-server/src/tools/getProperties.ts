import { BridgeClient } from '../bridge/bridgeClient.js';

export function getPropertiesTool(bridge: BridgeClient) {
    return {
        name: 'get_properties',
        description: 'Get the properties, attributes, and tags of a Roblox instance from the Rojo project.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                instancePath: {
                    type: 'string',
                    description: 'Dot-separated instance path (e.g. "game.ServerScriptService.MyScript")',
                },
            },
            required: ['instancePath'],
        },
        handler: async (args: { instancePath: string }) => {
            try {
                const properties = await bridge.getProperties(args.instancePath);
                return { content: [{ type: 'text' as const, text: JSON.stringify(properties, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
