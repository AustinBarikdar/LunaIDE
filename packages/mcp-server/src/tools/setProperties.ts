import { BridgeClient } from '../bridge/bridgeClient.js';

export function setPropertiesTool(bridge: BridgeClient) {
    return {
        name: 'set_properties',
        description: 'Set properties on a Roblox instance in the Rojo project file.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                instancePath: {
                    type: 'string',
                    description: 'Dot-separated instance path (e.g. "game.ServerScriptService.MyScript")',
                },
                properties: {
                    type: 'object',
                    description: 'Key-value pairs of properties to set',
                    additionalProperties: true,
                },
            },
            required: ['instancePath', 'properties'],
        },
        handler: async (args: { instancePath: string; properties: Record<string, unknown> }) => {
            try {
                await bridge.setProperties(args.instancePath, args.properties);
                return { content: [{ type: 'text' as const, text: `Properties updated on ${args.instancePath}` }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
