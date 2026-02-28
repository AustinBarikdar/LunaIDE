import { LockManager } from '../locking/lockManager.js';

export function releaseLockTool(lockManager: LockManager) {
    return {
        name: 'release_lock',
        description: 'Release a previously acquired file lock. Only the agent that acquired the lock can release it.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file to unlock.',
                },
                agentId: {
                    type: 'string',
                    description: 'Agent ID that owns the lock.',
                },
            },
            required: ['filePath', 'agentId'],
        },
        handler: async (args: { filePath: string; agentId: string }) => {
            try {
                lockManager.release(args.filePath, args.agentId);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ released: true, filePath: args.filePath }, null, 2),
                    }],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
