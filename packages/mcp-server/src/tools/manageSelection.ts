import { BridgeClient } from '../bridge/bridgeClient.js';

export function manageSelectionTool(bridge: BridgeClient) {
    return {
        name: 'manage_selection',
        description: 'Get or set the current selection in Roblox Studio (what the user has selected in the Explorer).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['get', 'set'],
                    description: 'The action to perform. "get" will return the currently selected instance paths. "set" will update the selection to the provided paths.',
                },
                paths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of dot-separated paths to select. Required when action is "set". e.g. ["game.Workspace.Part", "game.Lighting"]',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['action'],
        },
        handler: async (args: { action: 'get' | 'set'; paths?: string[]; studioId?: string }) => {
            try {
                let result;
                switch (args.action) {
                    case 'get':
                        result = await bridge.getSelection(args.studioId);
                        break;
                    case 'set':
                        if (!args.paths) {
                            throw new Error('paths is required when action is "set"');
                        }
                        result = await bridge.setSelection(args.paths, args.studioId);
                        break;
                    default:
                        throw new Error(`Invalid action: ${args.action}`);
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
