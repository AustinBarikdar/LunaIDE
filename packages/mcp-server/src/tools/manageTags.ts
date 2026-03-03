import { BridgeClient } from '../bridge/bridgeClient.js';

export function manageTagsTool(bridge: BridgeClient) {
    return {
        name: 'manage_tags',
        description: 'Add/remove CollectionService tags on instances, or query all instances with a given tag in live Roblox Studio.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['add', 'remove', 'get_tagged'],
                    description: '"add" or "remove" a tag on an instance, or "get_tagged" to list all instances with a tag.',
                },
                tag: {
                    type: 'string',
                    description: 'The tag name.',
                },
                path: {
                    type: 'string',
                    description: 'Dot-separated instance path. Required for "add" and "remove" actions.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['action', 'tag'],
        },
        handler: async (args: { action: string; tag: string; path?: string; studioId?: string }) => {
            try {
                const result = await bridge.manageTags(args.action, args.tag, args.path, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
