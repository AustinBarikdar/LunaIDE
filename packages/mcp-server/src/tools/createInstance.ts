import { BridgeClient } from '../bridge/bridgeClient.js';

export function createInstanceTool(bridge: BridgeClient) {
    return {
        name: 'create_instance',
        description: 'Creates a new instance in the live Roblox Studio DataModel. Supports setting initial properties. Creates an undo waypoint in Studio.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                className: {
                    type: 'string',
                    description: 'The Roblox class name to create, e.g. "Part", "Model", "Folder", "Script".',
                },
                parentPath: {
                    type: 'string',
                    description: 'Dot-separated path of the parent instance, e.g. "game.Workspace" or "game.ServerScriptService".',
                },
                name: {
                    type: 'string',
                    description: 'Optional name for the new instance. Defaults to the className.',
                },
                properties: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'Optional properties to set on the new instance. Supports Vector3 {X,Y,Z}, Color3 {R,G,B}, UDim2 {XScale,XOffset,YScale,YOffset}.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['className', 'parentPath'],
        },
        handler: async (args: { className: string; parentPath: string; name?: string; properties?: Record<string, unknown>; studioId?: string }) => {
            try {
                const result = await bridge.createInstance(args.className, args.parentPath, args.name, args.properties, args.studioId);
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
