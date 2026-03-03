import { BridgeClient } from '../bridge/bridgeClient.js';

export function getStudioModeTool(bridge: BridgeClient) {
    return {
        name: 'get_studio_mode',
        description: 'Get the current studio mode. Returns the studio mode. The result will be one of start_play, run_server, or stop.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
        handler: async () => {
            try {
                const result = await bridge.getStudioMode();
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
