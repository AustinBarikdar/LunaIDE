import { readFileSync } from 'fs';
import { BridgeClient } from '../bridge/bridgeClient.js';

export function captureScreenshotTool(bridge: BridgeClient) {
    return {
        name: 'capture_screenshot',
        description:
            'Capture a screenshot of the Roblox Studio window and return the image directly. ' +
            'Uses OS-level screen capture (macOS only) to grab the Roblox Studio window — ' +
            'no play mode or special APIs needed. Roblox Studio must be open. ' +
            'The screenshot image is returned inline so you can see it immediately.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                resolution: {
                    type: 'number',
                    description: 'Optional scale factor for the screenshot (e.g. 1 for full resolution, 0.5 for half). Default: 1.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID to target.',
                },
            },
        },
        handler: async (args: Record<string, unknown>) => {
            const resolution = args.resolution as number | undefined;
            const studioId = args.studioId as string | undefined;

            try {
                const result = await bridge.captureScreenshot(resolution, studioId) as { path: string; size?: number };

                if (!result || !result.path) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: 'Screenshot capture failed: No image data received.\n' +
                                'Ensure Roblox Studio is open and running on macOS.',
                        }],
                        isError: true,
                    };
                }

                // Read the PNG file and return it as base64 image content
                const imageBuffer = readFileSync(result.path);
                const base64Data = imageBuffer.toString('base64');

                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: base64Data,
                            mimeType: 'image/png',
                        },
                        {
                            type: 'text' as const,
                            text: `Screenshot captured (${result.size ? `${(result.size / 1024).toFixed(1)} KB` : 'unknown size'}). File saved at: ${result.path}`,
                        },
                    ],
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{
                        type: 'text' as const,
                        text: `Screenshot capture failed: ${message}\n\n` +
                            'Common issues:\n' +
                            '- Roblox Studio is not open\n' +
                            '- macOS screen recording permission not granted for LunaIDE\n' +
                            '- Not running on macOS (only macOS is currently supported)',
                    }],
                    isError: true,
                };
            }
        },
    };
}
