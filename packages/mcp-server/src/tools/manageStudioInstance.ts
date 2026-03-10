import { BridgeClient } from '../bridge/bridgeClient.js';

export function manageStudioInstanceTool(bridge: BridgeClient) {
    return {
        name: 'manage_studio_instance',
        description: 'Creates, updates, deletes, or moves/renames instances in the live Roblox Studio DataModel. Creates undo waypoints in Studio.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'update', 'delete', 'move_rename'],
                    description: 'The operation to perform.',
                },
                path: {
                    type: 'string',
                    description: 'Dot-separated path of the instance to modify/delete/move (e.g., "game.Workspace.Part"). Required for update, delete, move_rename.',
                },
                className: {
                    type: 'string',
                    description: 'For "create" action. The Roblox class name to create (e.g., "Part", "Model", "Folder", "Script").',
                },
                parentPath: {
                    type: 'string',
                    description: 'For "create" action. Dot-separated path of the parent instance (e.g., "game.Workspace").',
                },
                name: {
                    type: 'string',
                    description: 'For "create" action: optional name for the new instance (defaults to className). For "move_rename" action: new name to set.',
                },
                properties: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'For "create" and "update" actions. Key-value pairs. Supports coercion for Vector3, Color3, UDim2, etc.',
                },
                newParent: {
                    type: 'string',
                    description: 'For "move_rename" action. Dot-separated path of the new parent. Omit to keep the current parent.',
                },
                studioId: {
                    type: 'string',
                    description: 'Optional Studio instance ID. If omitted, uses the first connected Studio.',
                },
            },
            required: ['action'],
        },
        handler: async (args: {
            action: 'create' | 'update' | 'delete' | 'move_rename';
            path?: string;
            className?: string;
            parentPath?: string;
            name?: string;
            properties?: Record<string, unknown>;
            newParent?: string;
            studioId?: string;
        }) => {
            try {
                let result;
                switch (args.action) {
                    case 'create':
                        if (!args.className || !args.parentPath) {
                            throw new Error('className and parentPath are required for "create" action');
                        }
                        result = await bridge.createInstance(args.className, args.parentPath, args.name, args.properties, args.studioId);
                        break;
                    case 'update':
                        if (!args.path || !args.properties) {
                            throw new Error('path and properties are required for "update" action');
                        }
                        result = await bridge.setInstanceProperties(args.path, args.properties, args.studioId);
                        break;
                    case 'delete':
                        if (!args.path) {
                            throw new Error('path is required for "delete" action');
                        }
                        result = await bridge.deleteInstance(args.path, args.studioId);
                        break;
                    case 'move_rename':
                        if (!args.path) {
                            throw new Error('path is required for "move_rename" action');
                        }
                        result = await bridge.moveRenameInstance(args.path, args.name, args.newParent, args.studioId);
                        break;
                    default:
                        throw new Error(`Invalid action: ${args.action}`);
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
            }
        },
    };
}
