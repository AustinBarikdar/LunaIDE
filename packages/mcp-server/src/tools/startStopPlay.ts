import { BridgeClient } from '../bridge/bridgeClient.js';

export function startStopPlayTool(bridge: BridgeClient) {
    return {
        name: 'start_stop_play',
        description: "Start or stop play mode or run the server. Don't enter run_server mode unless you are sure no client/player is needed.",
        inputSchema: {
            type: 'object' as const,
            properties: {
                mode: {
                    type: 'string',
                    description: "Mode to start or stop, must be start_play, stop, or run_server. Don't use run_server unless you are sure no client/player is needed.",
                },
            },
            required: ['mode'],
        },
        handler: async (args: { mode: string }) => {
            try {
                const result = await bridge.startStopPlay(args.mode);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
