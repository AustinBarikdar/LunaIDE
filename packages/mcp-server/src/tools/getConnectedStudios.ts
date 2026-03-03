import { BridgeClient } from '../bridge/bridgeClient.js';

export function getConnectedStudiosTool(bridge: BridgeClient) {
    return {
        name: 'get_connected_studios',
        description: 'Lists connected Studio instances (studioId, placeName, placeId). Useful for multi-place workflows or verifying Studio is connected.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
        handler: async () => {
            try {
                const result = await bridge.getConnectedStudios();
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
