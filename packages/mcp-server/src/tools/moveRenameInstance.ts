import { BridgeClient } from '../bridge/bridgeClient.js';

export function moveRenameInstanceTool(bridge: BridgeClient) {
    return {
        name: 'move_rename_instance',
        description: 'Rename, reparent, or both on a live Roblox Studio instance. Creates an undo waypoint.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Dot-separated path of the instance to move/rename, e.g. "game.Workspace.OldPart".',
                },
                newName: {
                    type: 'string',
                    description: 'New name for the instance. Omit to keep the current name.',
                },
                newParent: {
                    type: 'string',
                    description: 'Dot-separated path of the new parent. Omit to keep the current parent.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['path'],
        },
        handler: async (args: { path: string; newName?: string; newParent?: string; studioId?: string }) => {
            try {
                const result = await bridge.moveRenameInstance(args.path, args.newName, args.newParent, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
