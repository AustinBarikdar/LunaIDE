import { BridgeClient } from '../bridge/bridgeClient.js';

export function getOutputTool(bridge: BridgeClient) {
    return {
        name: 'get_output',
        description: 'Get Studio output log (print, warn, error messages). Can filter by timestamp to get only new output since the last check.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                sinceTimestamp: {
                    type: 'number',
                    description: 'Only return output entries after this timestamp (milliseconds). Omit to get all buffered output.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, returns output from all connected Studios.',
                },
            },
        },
        handler: async (args: { sinceTimestamp?: number; studioId?: string }) => {
            try {
                const output = await bridge.getOutput(args.sinceTimestamp, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
