import { BridgeClient } from '../bridge/bridgeClient.js';
import { ToolContent } from './index.js';

export function captureScreenshotTool(bridge: BridgeClient) {
    return {
        name: 'capture_screenshot',
        description:
            'Captures a screenshot of the Roblox Studio window using macOS screen capture. ' +
            'Returns the image as base64 PNG for AI vision analysis. ' +
            'Useful for verifying visual outcomes after creating instances, running playtests, or modifying the scene. ' +
            'Studio window must be visible (not minimized or fully covered). ' +
            'Requires Screen Recording permission for the IDE in System Settings > Privacy.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                delay: {
                    type: 'number',
                    description: 'Optional delay in seconds before capturing (0-5). Useful to wait for rendering. Defaults to 0.',
                },
            },
        },
        handler: async (args: { delay?: number }) => {
            try {
                const result = await bridge.captureScreenshot(args.delay) as {
                    base64: string;
                    width?: number;
                    height?: number;
                    timestamp: number;
                };

                const content: ToolContent[] = [
                    {
                        type: 'image' as const,
                        data: result.base64,
                        mimeType: 'image/png',
                    },
                    {
                        type: 'text' as const,
                        text: JSON.stringify({
                            timestamp: result.timestamp,
                            width: result.width,
                            height: result.height,
                        }, null, 2),
                    },
                ];

                return { content };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${message}` }] as ToolContent[],
                    isError: true,
                };
            }
        },
    };
}
