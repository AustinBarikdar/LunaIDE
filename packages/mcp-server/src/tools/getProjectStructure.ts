import { BridgeClient } from '../bridge/bridgeClient.js';

export function getProjectStructureTool(bridge: BridgeClient) {
    return {
        name: 'get_project_structure',
        description: 'Get the full Rojo project tree showing how files map to Roblox instances.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
        handler: async () => {
            try {
                const structure = await bridge.getProjectStructure();
                return { content: [{ type: 'text' as const, text: JSON.stringify(structure, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
