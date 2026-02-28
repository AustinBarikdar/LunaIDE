import { BridgeClient } from '../bridge/bridgeClient.js';

export function writeScriptTool(bridge: BridgeClient) {
    return {
        name: 'write_script',
        description: 'Write content to a Luau script. Automatically creates a session snapshot before writing.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Relative or absolute path to the Luau script file',
                },
                content: {
                    type: 'string',
                    description: 'The new file content to write',
                },
                description: {
                    type: 'string',
                    description: 'Optional description for the snapshot (e.g. "Added health regen system")',
                },
            },
            required: ['filePath', 'content'],
        },
        handler: async (args: { filePath: string; content: string; description?: string }) => {
            try {
                await bridge.writeScript(args.filePath, args.content, args.description);
                return { content: [{ type: 'text' as const, text: `Successfully wrote to ${args.filePath}` }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
