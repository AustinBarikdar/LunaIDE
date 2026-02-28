import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { RojoConnectionState } from '@roblox-ide/shared';
import { RojoStatus } from './rojoStatus.js';

export class RojoManager implements vscode.Disposable {
  private serveProcess: ChildProcess | null = null;
  private sourcemapProcess: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private status: RojoStatus;
  private state: RojoConnectionState = 'disconnected';
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('LunaIDE: Rojo');
    this.status = new RojoStatus();
    this.disposables.push(this.outputChannel, this.status);

    // Watch for project file changes
    const projectFile = this.getProjectFileName();
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${projectFile}`);
    watcher.onDidChange(() => this.onProjectFileChanged());
    watcher.onDidCreate(() => this.onProjectFileChanged());
    watcher.onDidDelete(() => this.stop());
    this.disposables.push(watcher);
  }

  async start(): Promise<void> {
    if (this.serveProcess) {
      this.log('Rojo is already running.');
      return;
    }

    const rojoBinary = await this.findRojoBinary();
    if (!rojoBinary) {
      this.setState('error');
      vscode.window.showErrorMessage(
        'LunaIDE: Could not find rojo binary. Install rojo or set robloxIde.rojo.path in settings.'
      );
      return;
    }

    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    const projectFile = this.getProjectFilePath();
    if (!projectFile || !fs.existsSync(projectFile)) {
      this.log(`Project file not found: ${this.getProjectFileName()}`);
      this.setState('disconnected');
      return;
    }

    this.setState('connecting');
    this.log(`Starting Rojo with binary: ${rojoBinary}`);

    // Start rojo serve
    await this.startServe(rojoBinary, workspaceFolder);

    // Start sourcemap generation
    await this.startSourcemap(rojoBinary, workspaceFolder);
  }

  async stop(): Promise<void> {
    this.killProcess(this.serveProcess, 'serve');
    this.serveProcess = null;

    this.killProcess(this.sourcemapProcess, 'sourcemap');
    this.sourcemapProcess = null;

    this.setState('disconnected');
    this.log('Rojo stopped.');
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  getState(): RojoConnectionState {
    return this.state;
  }

  getSourcemapPath(): string | undefined {
    const workspaceFolder = this.getWorkspaceFolder();
    if (!workspaceFolder) return undefined;
    const smPath = path.join(workspaceFolder, 'sourcemap.json');
    return fs.existsSync(smPath) ? smPath : undefined;
  }

  private async startServe(rojoBinary: string, cwd: string): Promise<void> {
    const port = this.getPort();
    const projectFile = this.getProjectFileName();
    const args = ['serve', projectFile, '--port', port.toString()];

    this.log(`Running: ${rojoBinary} ${args.join(' ')}`);
    this.serveProcess = spawn(rojoBinary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    this.serveProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      this.log(text);
      if (text.includes('Rojo server listening')) {
        this.setState('connected');
      }
    });

    this.serveProcess.stderr?.on('data', (data: Buffer) => {
      this.log(`[stderr] ${data.toString().trim()}`);
    });

    this.serveProcess.on('exit', (code) => {
      this.log(`Rojo serve exited with code ${code}`);
      this.serveProcess = null;
      if (this.state === 'connected') {
        this.setState('disconnected');
      }
    });

    this.serveProcess.on('error', (err) => {
      this.log(`Rojo serve error: ${err.message}`);
      this.setState('error');
    });
  }

  private async startSourcemap(rojoBinary: string, cwd: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('robloxIde.luau.sourcemap');
    if (!config.get<boolean>('enabled', true)) {
      return;
    }

    const projectFile = this.getProjectFileName();
    const args = ['sourcemap', projectFile, '--watch', '--output', 'sourcemap.json'];

    this.log(`Running: ${rojoBinary} ${args.join(' ')}`);
    this.sourcemapProcess = spawn(rojoBinary, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    this.sourcemapProcess.stdout?.on('data', (data: Buffer) => {
      this.log(`[sourcemap] ${data.toString().trim()}`);
    });

    this.sourcemapProcess.stderr?.on('data', (data: Buffer) => {
      this.log(`[sourcemap/stderr] ${data.toString().trim()}`);
    });

    this.sourcemapProcess.on('exit', (code) => {
      this.log(`Rojo sourcemap exited with code ${code}`);
      this.sourcemapProcess = null;
    });

    this.sourcemapProcess.on('error', (err) => {
      this.log(`Rojo sourcemap error: ${err.message}`);
    });
  }

  private async findRojoBinary(): Promise<string | null> {
    const configPath = vscode.workspace.getConfiguration('robloxIde.rojo').get<string>('path', 'auto');

    if (configPath !== 'auto') {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      this.log(`Configured rojo path does not exist: ${configPath}`);
      return null;
    }

    // Try to find rojo in PATH
    const binaryName = process.platform === 'win32' ? 'rojo.exe' : 'rojo';

    // Check common locations
    const searchPaths = [
      // Aftman
      path.join(process.env.HOME || '', '.aftman', 'bin', binaryName),
      // Foreman
      path.join(process.env.HOME || '', '.foreman', 'bin', binaryName),
      // Cargo
      path.join(process.env.HOME || '', '.cargo', 'bin', binaryName),
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        return searchPath;
      }
    }

    // Try PATH via which/where
    try {
      const { execSync } = await import('child_process');
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${cmd} rojo`, { encoding: 'utf-8' }).trim();
      if (result) return result;
    } catch {
      // Not found in PATH
    }

    return null;
  }

  private killProcess(proc: ChildProcess | null, name: string): void {
    if (proc && !proc.killed) {
      this.log(`Killing ${name} process (PID: ${proc.pid})`);
      proc.kill('SIGTERM');
      // Force kill after 3 seconds if still alive
      setTimeout(() => {
        if (proc && !proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 3000);
    }
  }

  private setState(state: RojoConnectionState): void {
    this.state = state;
    this.status.update(state);
  }

  private onProjectFileChanged(): void {
    this.log('Project file changed, restarting Rojo...');
    this.restart();
  }

  private getPort(): number {
    return vscode.workspace.getConfiguration('robloxIde.rojo').get<number>('port', 34872);
  }

  private getProjectFileName(): string {
    return vscode.workspace.getConfiguration('robloxIde.rojo').get<string>('projectFile', 'default.project.json');
  }

  private getProjectFilePath(): string | undefined {
    const folder = this.getWorkspaceFolder();
    if (!folder) return undefined;
    return path.join(folder, this.getProjectFileName());
  }

  private getWorkspaceFolder(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.log('No workspace folder open.');
      return undefined;
    }
    return folders[0].uri.fsPath;
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  dispose(): void {
    this.stop();
    this.disposables.forEach((d) => d.dispose());
  }
}
