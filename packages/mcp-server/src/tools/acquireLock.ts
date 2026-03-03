import { LockManager } from '../locking/lockManager.js';

export function acquireLockTool(lockManager: LockManager) {
    return {
        name: 'acquire_lock',
        description: 'Acquire an exclusive lock on a file. Prevents other agents from writing to it. Locks auto-expire after 5 minutes. Use before making multiple related edits to a file.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file to lock (relative or absolute).',
                },
                agentId: {
                    type: 'string',
                    description: 'Unique identifier for this agent. Used to track lock ownership.',
                },
            },
            required: ['filePath', 'agentId'],
        },
        handler: async (args: { filePath: string; agentId: string }) => {
            try {
                const token = lockManager.acquire(args.filePath, args.agentId);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            locked: true,
                            filePath: args.filePath,
                            agentId: args.agentId,
                            token,
                            message: 'Lock acquired. Expires in 5 minutes. Call release_lock when done.',
                        }, null, 2),
                    }],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
