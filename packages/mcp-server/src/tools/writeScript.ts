import { BridgeClient } from '../bridge/bridgeClient.js';

export function writeScriptTool(bridge: BridgeClient) {
    return {
        name: 'write_script',
        description:
            'Write content to a Luau script in the Roblox project. Automatically creates a session snapshot before writing. ' +
            'IMPORTANT Roblox scripting rules: ' +
            '1) Use .server.lua for server Scripts, .client.lua for LocalScripts, .lua for ModuleScripts. ' +
            '2) Server is authoritative — client info can be trusted in some cases but ALWAYS validate RemoteEvent args on server (type, range, permissions). ' +
            '3) Use task.spawn/task.wait/task.delay (NOT deprecated wait/spawn/delay). ' +
            '4) Cache services at top: local Players = game:GetService("Players"). ' +
            '5) Set Instance properties BEFORE setting Parent. ' +
            '6) Use pcall around DataStore/network calls. ' +
            '7) Use camelCase for locals, PascalCase for modules/classes, UPPER_SNAKE for constants. ' +
            '8) Add Luau type annotations to function signatures. ' +
            '9) Use WaitForChild for replicated instances, never direct index. ' +
            '10) Always Disconnect events and Destroy instances when done. ' +
            'Read roblox://reference/luau-guide for full patterns and best practices.',
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
