import { BridgeClient } from '../bridge/bridgeClient.js';

export function rollbackSessionTool(bridge: BridgeClient) {
    return {
        name: 'rollback_session',
        description: 'Rollback files to a previous session snapshot. Use get_project_structure or list the session history to find snapshot IDs.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                snapshotId: {
                    type: 'string',
                    description: 'The snapshot ID to rollback to',
                },
            },
            required: ['snapshotId'],
        },
        handler: async (args: { snapshotId: string }) => {
            try {
                await bridge.rollbackToSnapshot(args.snapshotId);
                return { content: [{ type: 'text' as const, text: `Successfully rolled back to snapshot ${args.snapshotId}` }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
