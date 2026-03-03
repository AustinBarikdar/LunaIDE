import { BridgeClient } from '../bridge/bridgeClient.js';

export function getSelectionTool(bridge: BridgeClient) {
    return {
        name: 'get_selection',
        description: 'Returns the currently selected instances in Roblox Studio (name, className, path for each). Useful for understanding what the user is looking at.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
        },
        handler: async (args: { studioId?: string }) => {
            try {
                const result = await bridge.getSelection(args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
