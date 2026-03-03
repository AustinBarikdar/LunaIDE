import { BridgeClient } from '../bridge/bridgeClient.js';

export function runScriptInPlayModeTool(bridge: BridgeClient) {
    return {
        name: 'run_script_in_play_mode',
        description: 'Run a script in play mode and automatically stop play after script finishes or timeout. Returns the output of the script. Prefer using start_stop_play tool instead. Only use this to run one-time unit test code on the server datamodel. After calling this, the datamodel status will be reset to stop mode.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                code: {
                    type: 'string',
                    description: 'Code to run',
                },
                mode: {
                    type: 'string',
                    description: 'Mode to run in, must be start_play or run_server',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in seconds, defaults to 100 seconds',
                },
            },
            required: ['code', 'mode'],
        },
        handler: async (args: { code: string; mode: string; timeout?: number }) => {
            try {
                const result = await bridge.runScriptInPlayMode(args.code, args.mode, args.timeout);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
