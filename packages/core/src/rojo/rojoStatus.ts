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

  update(state: RojoConnectionState): void {
    switch (state) {
      case 'connected':
        this.statusBarItem.text = '$(check) Rojo';
        this.statusBarItem.tooltip = 'Rojo is connected. Click to restart.';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'connecting':
        this.statusBarItem.text = '$(sync~spin) Rojo';
        this.statusBarItem.tooltip = 'Rojo is connecting...';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'disconnected':
        this.statusBarItem.text = '$(circle-slash) Rojo';
        this.statusBarItem.tooltip = 'Rojo is disconnected. Click to start.';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'error':
        this.statusBarItem.text = '$(error) Rojo';
        this.statusBarItem.tooltip = 'Rojo encountered an error. Click to restart.';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
