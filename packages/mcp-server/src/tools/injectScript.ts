import { BridgeClient } from '../bridge/bridgeClient.js';

export function injectScriptTool(bridge: BridgeClient) {
    return {
        name: 'inject_script',
        description: 'Inject and execute a Luau script into Roblox Studio (ServerScriptService). Works in both edit mode and during a playtest.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                source: {
                    type: 'string',
                    description: 'Luau script source to inject',
                },
                name: {
                    type: 'string',
                    description: 'Optional name for the injected Script instance. Defaults to a timestamped name.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['source'],
        },
        handler: async (args: { source: string; name?: string; studioId?: string }) => {
            try {
                const result = await bridge.injectScript(args.source, args.name, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
