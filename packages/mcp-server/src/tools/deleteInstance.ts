import { BridgeClient } from '../bridge/bridgeClient.js';

export function deleteInstanceTool(bridge: BridgeClient) {
    return {
        name: 'delete_instance',
        description: 'Destroys an instance in the live Roblox Studio DataModel by path. Refuses to destroy top-level services. Creates an undo waypoint.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Dot-separated path of the instance to delete, e.g. "game.Workspace.MyPart".',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['path'],
        },
        handler: async (args: { path: string; studioId?: string }) => {
            try {
                const result = await bridge.deleteInstance(args.path, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
