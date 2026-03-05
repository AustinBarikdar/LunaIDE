import { BridgeClient } from '../bridge/bridgeClient.js';
import { LockManager } from '../locking/lockManager.js';
import { readScriptTool } from './readScript.js';
import { writeScriptTool } from './writeScript.js';
import { searchCodebaseTool } from './searchCodebase.js';
import { listInstancesTool } from './listInstances.js';
import { getPropertiesTool } from './getProperties.js';
import { setPropertiesTool } from './setProperties.js';
import { getDiagnosticsTool } from './getDiagnostics.js';
import { getProjectStructureTool } from './getProjectStructure.js';
import { rollbackSessionTool } from './rollbackSession.js';
import { getOutputTool } from './getOutput.js';
import { getChildrenTool } from './getChildren.js';
import { getInstancePropertiesTool } from './getInstanceProperties.js';
import { acquireLockTool } from './acquireLock.js';
import { releaseLockTool } from './releaseLock.js';
import { publishPlaceTool } from './publishPlace.js';
import { manageDatastoreTool } from './manageDatastore.js';
import { sendMessageTool } from './sendMessage.js';
import { runCodeTool } from './runCode.js';
import { getStudioModeTool } from './getStudioMode.js';
import { startStopPlayTool } from './startStopPlay.js';
import { insertModelTool } from './insertModel.js';
import { runScriptInPlayModeTool } from './runScriptInPlayMode.js';
import { getConsoleOutputTool } from './getConsoleOutput.js';
import { listSnapshotsTool } from './listSnapshots.js';
import { getConnectedStudiosTool } from './getConnectedStudios.js';
import { getSelectionTool } from './getSelection.js';
import { setSelectionTool } from './setSelection.js';
import { createInstanceTool } from './createInstance.js';
import { deleteInstanceTool } from './deleteInstance.js';
import { setInstancePropertiesTool } from './setInstanceProperties.js';
import { moveRenameInstanceTool } from './moveRenameInstance.js';
import { manageTagsTool } from './manageTags.js';

import { createUITool } from './createUI.js';
import { captureScreenshotTool } from './captureScreenshot.js';

export type ToolContent =
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string };

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    handler: (args: Record<string, unknown>) => Promise<{
        content: ToolContent[];
        isError?: boolean;
    }>;
}

/**
 * Create all MCP tool definitions bound to a bridge client and lock manager.
 */
export function createTools(bridge: BridgeClient, lockManager: LockManager): ToolDefinition[] {
    return [
        // Core tools
        readScriptTool(bridge),
        writeScriptTool(bridge),
        searchCodebaseTool(bridge),
        listInstancesTool(bridge),
        getPropertiesTool(bridge),
        setPropertiesTool(bridge),
        getDiagnosticsTool(bridge),
        getProjectStructureTool(bridge),
        rollbackSessionTool(bridge),
        // Studio tools
        getOutputTool(bridge),
        getChildrenTool(bridge),
        getInstancePropertiesTool(bridge),
        // File locking
        acquireLockTool(lockManager),
        releaseLockTool(lockManager),
        // Studio control (merged from Roblox Studio MCP)
        runCodeTool(bridge),
        getStudioModeTool(bridge),
        startStopPlayTool(bridge),
        insertModelTool(bridge),
        runScriptInPlayModeTool(bridge),
        getConsoleOutputTool(bridge),
        // New AI workflow tools
        listSnapshotsTool(bridge),
        getConnectedStudiosTool(bridge),
        getSelectionTool(bridge),
        setSelectionTool(bridge),
        createInstanceTool(bridge),
        deleteInstanceTool(bridge),
        setInstancePropertiesTool(bridge),
        moveRenameInstanceTool(bridge),
        manageTagsTool(bridge),

        createUITool(bridge),
        captureScreenshotTool(bridge),
        // OpenCloud
        publishPlaceTool(bridge),
        manageDatastoreTool(bridge),
        sendMessageTool(bridge),
    ] as ToolDefinition[];
}
