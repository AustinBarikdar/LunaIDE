import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ScriptTemplate {
    label: string;
    description: string;
    extension: string;
    content: string;
}

const TEMPLATES: ScriptTemplate[] = [
    {
        label: 'Server Script',
        description: 'Script that runs on the server',
        extension: '.server.luau',
        content: `-- Server Script
-- Runs on the server in ServerScriptService or Workspace

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

Players.PlayerAdded:Connect(function(player)
\tprint(player.Name .. " joined the game")
end)

Players.PlayerRemoving:Connect(function(player)
\tprint(player.Name .. " left the game")
end)
`,
    },
    {
        label: 'Local Script',
        description: 'Script that runs on the client',
        extension: '.client.luau',
        content: `-- Local Script
-- Runs on the client in StarterPlayerScripts or StarterGui

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer

UserInputService.InputBegan:Connect(function(input, gameProcessed)
\tif gameProcessed then return end
\t
\tif input.KeyCode == Enum.KeyCode.E then
\t\tprint("E pressed")
\tend
end)
`,
    },
    {
        label: 'Module Script',
        description: 'Reusable module that can be required by other scripts',
        extension: '.luau',
        content: `-- Module Script

local Module = {}

function Module.new()
\tlocal self = setmetatable({}, { __index = Module })
\treturn self
end

function Module:init()
\t-- Initialize module
end

function Module:destroy()
\t-- Cleanup
end

return Module
`,
    },
    {
        label: 'Test Script',
        description: 'Test script for validating game logic',
        extension: '.server.luau',
        content: `-- Test Script
-- Validates game logic. Run during playtest.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local function assertEquals(actual: any, expected: any, message: string?)
\tif actual ~= expected then
\t\terror(string.format(
\t\t\t"FAIL: %s\\n  Expected: %s\\n  Actual: %s",
\t\t\tmessage or "assertion failed",
\t\t\ttostring(expected),
\t\t\ttostring(actual)
\t\t))
\tend
\tprint(string.format("PASS: %s", message or "assertion passed"))
end

local function runTests()
\tprint("\\n=== Running Tests ===\\n")
\t
\t-- Add your tests here
\tassertEquals(1 + 1, 2, "basic math works")
\tassertEquals(typeof("hello"), "string", "typeof works for strings")
\t
\tprint("\\n=== All Tests Passed ===\\n")
end

runTests()
`,
    },
    {
        label: 'Component (OOP)',
        description: 'Object-oriented component with lifecycle methods',
        extension: '.luau',
        content: `-- Component Module (OOP Pattern)

local Component = {}
Component.__index = Component

export type Component = typeof(Component.new())

function Component.new(instance: Instance)
\tlocal self = setmetatable({}, Component)
\tself._instance = instance
\tself._connections = {} :: { RBXScriptConnection }
\tself._destroyed = false
\treturn self
end

function Component:start()
\t-- Called when the component starts
end

function Component:_connect(signal: RBXScriptSignal, callback: (...any) -> ())
\tlocal conn = signal:Connect(callback)
\ttable.insert(self._connections, conn)
\treturn conn
end

function Component:destroy()
\tif self._destroyed then return end
\tself._destroyed = true
\t
\tfor _, conn in self._connections do
\t\tconn:Disconnect()
\tend
\ttable.clear(self._connections)
end

return Component
`,
    },
    {
        label: 'RemoteEvent Handler',
        description: 'Server/client remote event communication',
        extension: '.server.luau',
        content: `-- Remote Event Handler (Server)
-- Handles client-to-server communication

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Create or get the RemoteEvent
local remoteEvent = ReplicatedStorage:FindFirstChild("MyRemoteEvent")
if not remoteEvent then
\tremoteEvent = Instance.new("RemoteEvent")
\tremoteEvent.Name = "MyRemoteEvent"
\tremoteEvent.Parent = ReplicatedStorage
end

remoteEvent.OnServerEvent:Connect(function(player: Player, action: string, data: any?)
\tprint(string.format("[Server] %s sent action: %s", player.Name, action))
\t
\tif action == "ping" then
\t\tremoteEvent:FireClient(player, "pong", tick())
\telseif action == "request_data" then
\t\t-- Send data back to the requesting client
\t\tlocal responseData = { score = 100, level = 5 }
\t\tremoteEvent:FireClient(player, "data_response", responseData)
\tend
end)
`,
    },
];

/**
 * Registers the "New Roblox Script" command.
 */
export function registerScriptTemplates(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('robloxIde.newScript', async () => {
            // Pick a template
            const selected = await vscode.window.showQuickPick(
                TEMPLATES.map((t) => ({
                    label: t.label,
                    description: t.description,
                    template: t,
                })),
                { placeHolder: 'Select a script template' }
            );

            if (!selected) return;
            const template = selected.template;

            // Ask for file name
            const fileName = await vscode.window.showInputBox({
                prompt: `Enter file name (extension: ${template.extension})`,
                placeHolder: `MyScript${template.extension}`,
                value: `NewScript${template.extension}`,
            });

            if (!fileName) return;

            // Determine target directory
            const folders = vscode.workspace.workspaceFolders;
            if (!folders || folders.length === 0) {
                vscode.window.showWarningMessage('No workspace folder open.');
                return;
            }

            // If a file is open, use its directory, otherwise use workspace root /src/
            const activeEditor = vscode.window.activeTextEditor;
            let targetDir: string;
            if (activeEditor) {
                targetDir = path.dirname(activeEditor.document.uri.fsPath);
            } else {
                targetDir = path.join(folders[0].uri.fsPath, 'src');
            }

            // Ensure name ends with correct extension
            const fullName = fileName.endsWith(template.extension) ? fileName : `${fileName}${template.extension}`;
            const fullPath = path.join(targetDir, fullName);

            // Don't overwrite existing files
            if (fs.existsSync(fullPath)) {
                vscode.window.showWarningMessage(`File already exists: ${fullName}`);
                return;
            }

            // Create the file
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, template.content, 'utf-8');

            // Open it
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(`Created ${fullName}`);
        })
    );
}
