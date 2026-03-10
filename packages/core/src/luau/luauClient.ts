import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js';
import { LuauDiagnostic } from '@roblox-ide/shared';

export class LuauClient implements vscode.Disposable {
  private client: LanguageClient | null = null;
  private outputChannel: vscode.OutputChannel;
  private statusBarItem: vscode.StatusBarItem;
  private diagnosticsCache: Map<string, LuauDiagnostic[]> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('LunaIDE: Luau LSP');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.disposables.push(this.outputChannel, this.statusBarItem);
  }

  async start(): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('robloxIde.luau').get<boolean>('enabled', true);
    if (!enabled) {
      this.log('Luau LSP is disabled.');
      return;
    }

    // If JohnnyMorganz.luau-lsp is installed and active, defer to it
    const johnnymorganz = vscode.extensions.getExtension('JohnnyMorganz.luau-lsp');
    if (johnnymorganz?.isActive) {
      this.log('JohnnyMorganz.luau-lsp is active — deferring LSP to it.');
      this.subscribeTodiagnostics();
      return;
    }

    const binary = await this.findLuauLspBinary();
    if (!binary) {
      this.log('luau-lsp binary not found. Install via aftman: roblox/luau-lsp');
      this.statusBarItem.text = '$(warning) Luau';
      this.statusBarItem.tooltip = 'luau-lsp not found — install it via aftman (roblox/luau-lsp) or set robloxIde.luau.path';
      this.statusBarItem.show();
      return;
    }

    this.log(`Starting Luau LSP with binary: ${binary}`);

    const serverOptions: ServerOptions = {
      command: binary,
      args: this.buildArgs(),
      transport: TransportKind.stdio,
    };

    const clientOptions: LanguageClientOptions = {
      documentSelector: [
        { scheme: 'file', language: 'luau' },
        { scheme: 'file', language: 'lua' },
      ],
      outputChannel: this.outputChannel,
      initializationOptions: {
        platform: { type: 'roblox' },
      },
    };

    this.client = new LanguageClient(
      'robloxIde-luau',
      'LunaIDE Luau LSP',
      serverOptions,
      clientOptions,
    );

    this.subscribeTodiagnostics();

    await this.client.start();
    this.log('Luau LSP started.');
    this.statusBarItem.text = '$(check) Luau';
    this.statusBarItem.tooltip = 'Luau LSP running';
    this.statusBarItem.show();
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = null;
      this.log('Luau LSP stopped.');
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get all cached diagnostics (for MCP server consumption).
   */
  getAllDiagnostics(): LuauDiagnostic[] {
    const all: LuauDiagnostic[] = [];
    for (const diags of this.diagnosticsCache.values()) {
      all.push(...diags);
    }
    return all;
  }

  /**
   * Get diagnostics for a specific file.
   */
  getDiagnosticsForFile(filePath: string): LuauDiagnostic[] {
    return this.diagnosticsCache.get(filePath) || [];
  }

  private subscribeTodiagnostics(): void {
    // Track diagnostics for MCP server consumption
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) => {
        for (const uri of e.uris) {
          const diagnostics = vscode.languages.getDiagnostics(uri);
          const luauDiags: LuauDiagnostic[] = diagnostics.map((d) => ({
            filePath: uri.fsPath,
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
            endLine: d.range.end.line + 1,
            endColumn: d.range.end.character + 1,
            severity: this.mapSeverity(d.severity),
            message: d.message,
            code: typeof d.code === 'object' ? String(d.code.value) : d.code !== undefined ? String(d.code) : undefined,
          }));
          this.diagnosticsCache.set(uri.fsPath, luauDiags);
        }
      })
    );
  }

  private buildArgs(): string[] {
    const args = ['lsp'];

    // Add bundled Roblox type definitions if present
    const defsPath = path.join(this.context.extensionPath, 'assets', 'globalTypes.d.luau');
    if (fs.existsSync(defsPath)) {
      args.push(`--definitions=${defsPath}`);
    }

    return args;
  }

  private async findLuauLspBinary(): Promise<string | null> {
    const configPath = vscode.workspace.getConfiguration('robloxIde.luau').get<string>('path', 'auto');

    if (configPath !== 'auto') {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      this.log(`Configured luau-lsp path does not exist: ${configPath}`);
      return null;
    }

    const binaryName = process.platform === 'win32' ? 'luau-lsp.exe' : 'luau-lsp';

    // Check bundled binary first (downloaded by prepare.sh)
    const bundledBinary = path.join(this.context.extensionPath, 'assets', 'bin', binaryName);
    if (fs.existsSync(bundledBinary)) {
      this.log(`Using bundled luau-lsp: ${bundledBinary}`);
      return bundledBinary;
    }

    // Check common locations
    const searchPaths = [
      // Aftman
      path.join(os.homedir(), '.aftman', 'bin', binaryName),
      // Foreman
      path.join(os.homedir(), '.foreman', 'bin', binaryName),
      // Cargo
      path.join(os.homedir(), '.cargo', 'bin', binaryName),
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        return searchPath;
      }
    }

    // Try PATH
    try {
      const { execSync } = await import('child_process');
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${cmd} luau-lsp`, { encoding: 'utf-8' }).trim();
      if (result) return result;
    } catch {
      // Not found
    }

    return null;
  }

  private mapSeverity(severity: vscode.DiagnosticSeverity): LuauDiagnostic['severity'] {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error: return 'error';
      case vscode.DiagnosticSeverity.Warning: return 'warning';
      case vscode.DiagnosticSeverity.Information: return 'information';
      case vscode.DiagnosticSeverity.Hint: return 'hint';
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  dispose(): void {
    void this.stop().finally(() => {
      this.disposables.forEach((d) => d.dispose());
    });
  }
}
