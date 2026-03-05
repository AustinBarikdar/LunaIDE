import { BridgeClient } from '../bridge/bridgeClient.js';

export function readScriptTool(bridge: BridgeClient) {
    return {
        name: 'read_script',
        description:
            'Read a Luau script from the Roblox project. Returns the file content as text. ' +
            'File types: .server.lua (Script, runs on server), .client.lua (LocalScript, runs on client), .lua (ModuleScript, shared). ' +
            'Scripts live under src/ and map to Roblox services via Rojo: src/server → ServerScriptService, src/client → StarterPlayerScripts, ' +
            'src/shared → ReplicatedStorage, src/gui → StarterGui. ' +
            'Read the roblox://reference/luau-guide resource for Luau best practices, service APIs, and architecture patterns before writing code.',
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
