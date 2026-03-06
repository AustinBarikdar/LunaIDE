import { BridgeClient } from '../bridge/bridgeClient.js';

export function publishPlaceTool(bridge: BridgeClient) {
    return {
        name: 'publish_place',
        description: 'Publish the current Roblox place to the Roblox platform via Open Cloud API. Requires an API key to be configured.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                universeId: { type: 'number', description: 'The Universe ID to publish to.' },
                placeId: { type: 'number', description: 'The Place ID to publish.' },
                filePath: { type: 'string', description: 'Path to the .rbxl or .rbxlx file to upload.' },
                versionType: { type: 'string', enum: ['Saved', 'Published'], description: 'Version type. Default: "Published".' },
            },
            required: ['universeId', 'placeId', 'filePath'],
        },
        handler: async (args: { universeId: number; placeId: number; filePath: string; versionType?: string }) => {
            try {
                const result = await bridge.publishPlace(args.universeId, args.placeId, args.filePath, args.versionType);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
