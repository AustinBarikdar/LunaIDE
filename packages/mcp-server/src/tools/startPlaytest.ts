import { BridgeClient } from '../bridge/bridgeClient.js';

export function startPlaytestTool(bridge: BridgeClient) {
    return {
        name: 'start_playtest',
        description: 'Launch a playtest in Roblox Studio. Optionally inject a test script that runs during the playtest.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                mode: {
                    type: 'string',
                    description: 'Playtest mode: "Play", "Run", or "PlayHere". Default: "Play"',
                    enum: ['Play', 'Run', 'PlayHere'],
                },
                testScript: {
                    type: 'string',
                    description: 'Optional Luau script source to inject and execute during playtest',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
        },
        handler: async (args: { mode?: string; testScript?: string; studioId?: string }) => {
            try {
                const result = await bridge.startPlaytest(args.mode, args.testScript, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
