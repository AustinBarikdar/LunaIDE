import * as vscode from 'vscode';
import { RojoConnectionState } from '@roblox-ide/shared';

export class RojoStatus implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'robloxIde.rojo.restart';
    this.update('disconnected');
    this.statusBarItem.show();
  }

  update(state: RojoConnectionState, port?: number): void {
    const portLabel = port ? ` :${port}` : '';
    switch (state) {
      case 'connected':
        this.statusBarItem.text = `$(check) Sync${portLabel}`;
        this.statusBarItem.tooltip = `Sync is running on port ${port}. Click to stop.`;
        this.statusBarItem.command = 'robloxIde.rojo.stop';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'connecting':
        this.statusBarItem.text = `$(sync~spin) Sync${portLabel}`;
        this.statusBarItem.tooltip = `Sync is connecting on port ${port}... Click to stop.`;
        this.statusBarItem.command = 'robloxIde.rojo.stop';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'disconnected':
        this.statusBarItem.text = '$(circle-slash) Sync';
        this.statusBarItem.tooltip = 'Sync is stopped. Click to start.';
        this.statusBarItem.command = 'robloxIde.rojo.start';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'error':
        this.statusBarItem.text = '$(error) Sync';
        this.statusBarItem.tooltip = 'Sync error. Click to retry.';
        this.statusBarItem.command = 'robloxIde.rojo.start';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
