import { BridgeClient } from '../bridge/bridgeClient.js';

export function sendMessageTool(bridge: BridgeClient) {
    return {
        name: 'send_message',
        description: 'Publish a message to a Roblox MessagingService topic via Open Cloud API. Useful for sending commands to running game servers.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                universeId: { type: 'number', description: 'The Universe ID.' },
                topic: { type: 'string', description: 'The topic name to publish to.' },
                message: { type: 'string', description: 'The message content (string).' },
            },
            required: ['universeId', 'topic', 'message'],
        },
        handler: async (args: { universeId: number; topic: string; message: string }) => {
            try {
                await bridge.sendMessage(args.universeId, args.topic, args.message);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({ sent: true, topic: args.topic }, null, 2),
                    }],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
