import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export const AGENT_IDS = ['claudecode', 'cursor', 'windsurf', 'cline'] as const;
export type AgentId = typeof AGENT_IDS[number];

export const AGENT_LABELS: Record<AgentId, string> = {
    claudecode: 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    cline: 'Cline (VS Code)',
};

export class AgentConnector {
    static getMcpServerPath(extensionPath: string): string {
        const extDir = path.dirname(extensionPath);
        return path.join(extDir, 'roblox-ide.roblox-ide-mcp-0.1.0', 'dist', 'index.js');
    }

    static getRobloxMcpPath(): string {
        const home = process.env.HOME ?? '';
        return path.join(home, '.lunaide', 'bin', 'RobloxStudioMCP.app', 'Contents', 'MacOS', 'rbx-studio-mcp');
    }

    static findNodeBinary(): string {
        const envPath = process.env.PATH ?? '';
        for (const dir of envPath.split(':')) {
            const bin = path.join(dir, 'node');
            if (fs.existsSync(bin)) return bin;
        }
        for (const p of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']) {
            if (fs.existsSync(p)) return p;
        }
        return 'node';
    }

    static agentConfigPath(agentId: string, workspacePath?: string): string {
        const home = process.env.HOME ?? '';
        switch (agentId) {
            case 'claudecode':
                return workspacePath ? path.join(workspacePath, '.mcp.json') : path.join(home, '.mcp.json');
            case 'cursor':
                return path.join(home, '.cursor', 'mcp.json');
            case 'windsurf':
                return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
            case 'cline':
                return path.join(home, '.vscode', 'settings.json');
            default:
                return '';
        }
    }

    static isAgentInstalled(agentId: string): boolean {
        const home = process.env.HOME ?? '';
        switch (agentId) {
            case 'claudecode':
                return fs.existsSync(path.join(home, '.claude')) ||
                    AgentConnector._tryWhich('claude') !== '';
            case 'cursor':
                return fs.existsSync('/Applications/Cursor.app') ||
                    fs.existsSync(path.join(home, '.cursor'));
            case 'windsurf':
                return fs.existsSync('/Applications/Windsurf.app') ||
                    fs.existsSync(path.join(home, '.codeium', 'windsurf'));
            case 'cline':
                return fs.existsSync(path.join(home, '.vscode', 'extensions')) &&
                    fs.readdirSync(path.join(home, '.vscode', 'extensions'))
                        .some((d) => d.startsWith('saoudrizwan.claude-dev'));
            default:
                return false;
        }
    }

    static isAgentConfigured(agentId: string, workspacePath?: string): boolean {
        const cfgPath = AgentConnector.agentConfigPath(agentId, workspacePath);
        if (!cfgPath || !fs.existsSync(cfgPath)) return false;
        try {
            const raw = fs.readFileSync(cfgPath, 'utf-8');
            const json = JSON.parse(raw);
            if (agentId === 'cline') {
                return !!(json?.['cline.mcpServers']?.lunaide);
            }
            return !!(json?.mcpServers?.lunaide);
        } catch {
            return false;
        }
    }

    static async configureAgent(agentId: string, extensionPath: string, workspacePath?: string): Promise<void> {
        const mcpServer = AgentConnector.getMcpServerPath(extensionPath);
        const node = AgentConnector.findNodeBinary();
        const cfgPath = AgentConnector.agentConfigPath(agentId, workspacePath);

        if (!cfgPath) {
            throw new Error(`Unknown agent: ${agentId}`);
        }

        const lunaideEntry = {
            command: node,
            args: [mcpServer],
        };

        const robloxMcpPath = AgentConnector.getRobloxMcpPath();
        const robloxEntry = fs.existsSync(robloxMcpPath)
            ? { command: robloxMcpPath, args: ['--stdio'] }
            : null;

        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });

        if (agentId === 'cline') {
            let existing: Record<string, unknown> = {};
            if (fs.existsSync(cfgPath)) {
                try { existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch { /* start fresh */ }
            }
            const servers = (existing['cline.mcpServers'] as Record<string, unknown>) ?? {};
            servers['lunaide'] = lunaideEntry;
            if (robloxEntry) servers['Roblox_Studio'] = robloxEntry;
            existing['cline.mcpServers'] = servers;
            fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2));
        } else {
            let existing: Record<string, unknown> = {};
            if (fs.existsSync(cfgPath)) {
                try { existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch { /* start fresh */ }
            }
            const servers = (existing['mcpServers'] as Record<string, unknown>) ?? {};
            servers['lunaide'] = lunaideEntry;
            if (robloxEntry) servers['Roblox_Studio'] = robloxEntry;
            existing['mcpServers'] = servers;
            fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2));
        }
    }

    private static _tryWhich(bin: string): string {
        try { return execSync(`which ${bin}`, { encoding: 'utf-8' }).trim(); } catch { return ''; }
    }
}
