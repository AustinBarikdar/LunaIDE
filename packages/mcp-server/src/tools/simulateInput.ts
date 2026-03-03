import { BridgeClient } from '../bridge/bridgeClient.js';

export function simulateInputTool(bridge: BridgeClient) {
    return {
        name: 'simulate_input',
        description:
            'Simulate player input in Roblox Studio during play mode using VirtualUser. ' +
            'Supports keyboard (key_down, key_up, type_key), mouse (click, button1_down, button1_up, button2_down, button2_up, move_mouse), ' +
            'and character movement helpers (set_key_down, set_key_up). Only works while a playtest is active.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: [
                        'key_down',
                        'key_up',
                        'type_key',
                        'click',
                        'button1_down',
                        'button1_up',
                        'button2_down',
                        'button2_up',
                        'move_mouse',
                        'set_key_down',
                        'set_key_up',
                    ],
                    description:
                        'The input action to simulate. ' +
                        'key_down/key_up: press/release a key. type_key: press and release. ' +
                        'click: left-click at position. button1/2_down/up: mouse button control. ' +
                        'move_mouse: move cursor. set_key_down/up: hold/release for movement (WASD, Space, etc).',
                },
                key: {
                    type: 'string',
                    description:
                        'Enum.KeyCode name (without the "Enum.KeyCode." prefix), e.g. "W", "Space", "E", "LeftShift". ' +
                        'Required for key_down, key_up, type_key, set_key_down, set_key_up.',
                },
                x: {
                    type: 'number',
                    description: 'X position in screen pixels. Used for mouse actions. Defaults to viewport center.',
                },
                y: {
                    type: 'number',
                    description: 'Y position in screen pixels. Used for mouse actions. Defaults to viewport center.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID.',
                },
            },
            required: ['action'],
        },
        handler: async (args: { action: string; key?: string; x?: number; y?: number; studioId?: string }) => {
            try {
                const result = await bridge.simulateInput(args.action, args.key, args.x, args.y, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
