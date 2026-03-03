import { BridgeClient } from '../bridge/bridgeClient.js';

export function getConsoleOutputTool(bridge: BridgeClient) {
    return {
        name: 'get_console_output',
        description: 'Get the console output from Roblox Studio.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
        handler: async () => {
            try {
                const output = await bridge.getOutput();
                return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
