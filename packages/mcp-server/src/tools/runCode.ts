import { BridgeClient } from '../bridge/bridgeClient.js';

export function runCodeTool(bridge: BridgeClient) {
    return {
        name: 'run_code',
        description: 'Runs a command in Roblox Studio and returns the printed output. Can be used to both make changes and retrieve information. IMPORTANT: If modifying script Source properties, also edit the corresponding file in the IDE using write_script, since files are Rojo-linked to Studio.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                command: {
                    type: 'string',
                    description: 'Code to run',
                },
            },
            required: ['command'],
        },
        handler: async (args: { command: string }) => {
            try {
                const result = await bridge.runCode(args.command);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
