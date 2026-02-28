import { BridgeClient } from '../bridge/bridgeClient.js';

export function readScriptTool(bridge: BridgeClient) {
    return {
        name: 'read_script',
        description: 'Read a Luau script from the project. Returns the file content as text.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Relative or absolute path to the Luau script file',
                },
            },
            required: ['filePath'],
        },
        handler: async (args: { filePath: string }) => {
            try {
                const content = await bridge.readScript(args.filePath);
                return { content: [{ type: 'text' as const, text: content }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
