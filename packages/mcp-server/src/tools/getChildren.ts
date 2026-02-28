import { BridgeClient } from '../bridge/bridgeClient.js';

export function getChildrenTool(bridge: BridgeClient) {
    return {
        name: 'get_children',
        description: 'Get the children of a Roblox instance from the live Studio DataModel. Returns name, className, and child count for each child. Supports configurable recursion depth.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Dot-separated instance path, e.g. "game.Workspace" or "game.ReplicatedStorage.Modules". Defaults to "game" (root).',
                },
                depth: {
                    type: 'number',
                    description: 'How many levels deep to recurse. 1 = direct children only (default), 2 = children and grandchildren, etc.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
        },
        handler: async (args: { path?: string; depth?: number; studioId?: string }) => {
            try {
                const result = await bridge.getStudioChildren(args.path, args.depth, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
