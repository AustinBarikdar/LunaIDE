import { BridgeClient } from '../bridge/bridgeClient.js';

export function stopPlaytestTool(bridge: BridgeClient) {
    return {
        name: 'stop_playtest',
        description: 'Stop a running playtest in Roblox Studio.',
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
                const result = await bridge.stopPlaytest(args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
