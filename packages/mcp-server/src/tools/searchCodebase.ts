import { BridgeClient } from '../bridge/bridgeClient.js';

export function searchCodebaseTool(bridge: BridgeClient) {
    return {
        name: 'search_codebase',
        description: 'Search across all Luau/Lua files in the project for a text or regex pattern.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query string or regex pattern',
                },
                regex: {
                    type: 'boolean',
                    description: 'If true, treat query as a regex pattern. Default: false',
                },
                include: {
                    type: 'string',
                    description: 'Glob pattern to filter files (e.g. "src/**/*.luau")',
                },
            },
            required: ['query'],
        },
        handler: async (args: { query: string; regex?: boolean; include?: string }) => {
            try {
                const results = await bridge.searchFiles(args.query, {
                    regex: args.regex,
                    include: args.include,
                });
                return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
