import { BridgeClient } from '../bridge/bridgeClient.js';

export function setInstancePropertiesTool(bridge: BridgeClient) {
    return {
        name: 'set_instance_properties',
        description: 'Sets properties on a live Roblox Studio instance (not the Rojo project file). Supports type coercion: Vector3 {X,Y,Z}, Color3 {R,G,B}, UDim2 {XScale,XOffset,YScale,YOffset}, Vector2 {X,Y}. Creates an undo waypoint.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: {
                    type: 'string',
                    description: 'Dot-separated path of the instance, e.g. "game.Workspace.Part".',
                },
                properties: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'Key-value pairs of properties to set. Tables are coerced to Roblox types automatically.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['path', 'properties'],
        },
        handler: async (args: { path: string; properties: Record<string, unknown>; studioId?: string }) => {
            try {
                const result = await bridge.setInstanceProperties(args.path, args.properties, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
