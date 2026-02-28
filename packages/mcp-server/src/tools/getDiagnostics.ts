import { BridgeClient } from '../bridge/bridgeClient.js';

export function getDiagnosticsTool(bridge: BridgeClient) {
    return {
        name: 'get_diagnostics',
        description: 'Get Luau LSP diagnostics (errors, warnings, hints). Optionally filter by file path.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Optional file path to get diagnostics for. Omit to get all diagnostics.',
                },
            },
        },
        handler: async (args: { filePath?: string }) => {
            try {
                const diagnostics = await bridge.getDiagnostics(args.filePath);
                return { content: [{ type: 'text' as const, text: JSON.stringify(diagnostics, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
