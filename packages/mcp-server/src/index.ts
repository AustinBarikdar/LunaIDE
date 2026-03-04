import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '@roblox-ide/shared';
import { BridgeClient } from './bridge/bridgeClient.js';
import { LockManager } from './locking/lockManager.js';
import { createTools, ToolDefinition } from './tools/index.js';
import { createResources, ResourceDefinition } from './resources/index.js';

async function main(): Promise<void> {
    const workspacePath = process.argv[2] || process.env.LUNAIDE_WORKSPACE || process.cwd();

    console.error(`[${MCP_SERVER_NAME}] Starting MCP server v${MCP_SERVER_VERSION}`);
    console.error(`[${MCP_SERVER_NAME}] Workspace: ${workspacePath}`);

    // Create bridge client
    const bridge = new BridgeClient(workspacePath);

    // Create lock manager (in-memory, per-process)
    const lockManager = new LockManager();

    // Try to connect to bridge (non-fatal — tools will fail gracefully)
    try {
        await bridge.connect();
        console.error(`[${MCP_SERVER_NAME}] Connected to extension bridge`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${MCP_SERVER_NAME}] Warning: Bridge not available (${message}). Tools will retry on each call.`);
    }

    // Create MCP server
    const server = new Server(
        { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    // Register tools
    const tools: ToolDefinition[] = createTools(bridge, lockManager);

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = tools.find((t) => t.name === name);

        if (!tool) {
            return {
                content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        // Ensure bridge is connected before calling tools
        if (!bridge.isConnected()) {
            try {
                await bridge.connect();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{ type: 'text' as const, text: `Bridge not available: ${message}. Is the LunaIDE extension running?` }],
                    isError: true,
                };
            }
        }

        return tool.handler(args || {});
    });

    // Register resources
    const resources: ResourceDefinition[] = createResources(bridge);

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: resources.map((r) => ({
                uri: r.uri,
                name: r.name,
                description: r.description,
                mimeType: r.mimeType,
            })),
        };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        const resource = resources.find((r) => r.uri === uri);

        if (!resource) {
            throw new Error(`Unknown resource: ${uri}`);
        }

        // Ensure bridge is connected
        if (!bridge.isConnected()) {
            try {
                await bridge.connect();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(`Bridge not available: ${message}`);
            }
        }

        return resource.handler();
    });

    // Start transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`[${MCP_SERVER_NAME}] MCP server running on stdio`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
