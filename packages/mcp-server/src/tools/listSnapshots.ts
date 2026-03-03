import { BridgeClient } from '../bridge/bridgeClient.js';

export function listSnapshotsTool(bridge: BridgeClient) {
    return {
        name: 'list_snapshots',
        description: 'Lists available session snapshots (id, timestamp, description, fileCount). Use rollback_session to restore a snapshot.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
        handler: async () => {
            try {
                const result = await bridge.getSnapshots();
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
