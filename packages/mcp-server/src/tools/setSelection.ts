import { BridgeClient } from '../bridge/bridgeClient.js';

export function setSelectionTool(bridge: BridgeClient) {
    return {
        name: 'set_selection',
        description: 'Selects instances in Roblox Studio by their dot-separated paths. Directs user attention to specific instances.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                paths: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of dot-separated instance paths to select, e.g. ["game.Workspace.Part", "game.Workspace.Model"].',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['paths'],
        },
        handler: async (args: { paths: string[]; studioId?: string }) => {
            try {
                const result = await bridge.setSelection(args.paths, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
