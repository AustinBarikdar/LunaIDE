import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export const AGENT_IDS = ['claudecode', 'codexcli'] as const;
export type AgentId = typeof AGENT_IDS[number];

export const AGENT_LABELS: Record<AgentId, string> = {
    claudecode: 'Claude Code',
    codexcli: 'Codex CLI',
};

export class AgentConnector {
    static getMcpServerPath(extensionPath: string): string {
        const extDir = path.dirname(extensionPath);
        return path.join(extDir, 'roblox-ide.roblox-ide-mcp-0.1.0', 'dist', 'index.js');
    }

    static findNodeBinary(): string {
        const isWindows = process.platform === 'win32';
        const nodeName = isWindows ? 'node.exe' : 'node';
        const envPath = process.env.PATH ?? '';
        for (const dir of envPath.split(path.delimiter)) {
            const bin = path.join(dir, nodeName);
            if (fs.existsSync(bin)) return bin;
        }
        if (!isWindows) {
            for (const p of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']) {
                if (fs.existsSync(p)) return p;
            }
        }
        return 'node';
    }

    static agentConfigPath(agentId: string, workspacePath?: string): string {
        const home = os.homedir();
        switch (agentId) {
            case 'claudecode':
                return workspacePath ? path.join(workspacePath, '.mcp.json') : path.join(home, '.mcp.json');
            case 'codexcli': {
                return path.join(home, '.codex', 'config.toml');
            }
            default:
                return '';
        }
    }

    static isAgentInstalled(agentId: string): boolean {
        const home = os.homedir();
        switch (agentId) {
            case 'claudecode':
                return fs.existsSync(path.join(home, '.claude')) ||
                    AgentConnector._tryWhich('claude') !== '';
            case 'codexcli': {
                return AgentConnector._tryWhich('codex') !== '';
            }
            default:
                return false;
        }
    }

    static isAgentConfigured(agentId: string, workspacePath?: string): boolean {
        const cfgPath = AgentConnector.agentConfigPath(agentId, workspacePath);
        if (!cfgPath || !fs.existsSync(cfgPath)) return false;
        try {
            const raw = fs.readFileSync(cfgPath, 'utf-8');
            if (agentId === 'codexcli') {
                return raw.includes('[mcp_servers.lunaide]');
            }
            const json = JSON.parse(raw);
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
            args: workspacePath ? [mcpServer, workspacePath] : [mcpServer],
        };

        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });

        if (agentId === 'codexcli') {
            let content = '';
            if (fs.existsSync(cfgPath)) {
                content = fs.readFileSync(cfgPath, 'utf-8');
            }
            const argsToml = workspacePath
                ? `["${mcpServer}", "${workspacePath}"]`
                : `["${mcpServer}"]`;
            const tomlBlock = `[mcp_servers.lunaide]\ncommand = "${node}"\nargs = ${argsToml}`;
            if (content.includes('[mcp_servers.lunaide]') || content.includes('[mcpServers.lunaide]')) {
                // Replace the entire existing block up to the next section or EOF
                content = content.replace(
                    /\[(mcp_servers|mcpServers)\.lunaide\][\s\S]*?(?=\n\[|$)/,
                    tomlBlock + '\n'
                );
                fs.writeFileSync(cfgPath, content);
            } else {
                fs.appendFileSync(cfgPath, '\n' + tomlBlock + '\n');
            }

        } else {
            let existing: Record<string, unknown> = {};
            if (fs.existsSync(cfgPath)) {
                try { existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch { /* start fresh */ }
            }
            const servers = (existing['mcpServers'] as Record<string, unknown>) ?? {};
            servers['lunaide'] = lunaideEntry;
            existing['mcpServers'] = servers;
            fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2));
        }
    }

    private static _tryWhich(bin: string): string {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        try { return execSync(`${cmd} ${bin}`, { encoding: 'utf-8' }).trim().split('\n')[0]; } catch { return ''; }
    }
}
