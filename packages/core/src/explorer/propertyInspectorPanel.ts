import * as vscode from 'vscode';
import { StudioManager } from '../studio/studioManager.js';

/**
 * WebView panel displaying properties of a selected Roblox instance.
 */
export class PropertyInspectorPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | null = null;
    private studioManager: StudioManager;

    constructor(studioManager: StudioManager) {
        this.studioManager = studioManager;
    }

    async show(instancePath: string): Promise<void> {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                'robloxIde.propertyInspector',
                'Property Inspector',
                vscode.ViewColumn.Two,
                { enableScripts: false }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }

        this.panel.title = `Properties: ${instancePath.split('.').pop()}`;
        this.panel.webview.html = await this.getContent(instancePath);
        this.panel.reveal();
    }

    private async getContent(instancePath: string): Promise<string> {
        let data: Record<string, unknown> = {};

        const studioId = this.studioManager.getFirstStudioId();
        if (studioId) {
            try {
                data = await this.studioManager.sendCommand(studioId, 'get_instance_properties', {
                    path: instancePath,
                }) as Record<string, unknown>;
            } catch {
                data = { error: 'Failed to fetch properties from Studio' };
            }
        } else {
            data = { error: 'No Studio connected' };
        }

        const properties = (data.properties || {}) as Record<string, unknown>;
        const attributes = (data.attributes || {}) as Record<string, unknown>;
        const tags = (data.tags || []) as string[];

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 12px;
      margin: 0;
    }
    h2 {
      font-size: 14px;
      margin: 16px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      color: var(--vscode-foreground);
    }
    h2:first-child { margin-top: 0; }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .header .name {
      font-size: 16px;
      font-weight: 600;
    }
    .header .class {
      opacity: 0.7;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      padding: 3px 8px;
      vertical-align: top;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    td:first-child {
      width: 40%;
      opacity: 0.8;
      font-weight: 500;
    }
    td:last-child {
      word-break: break-word;
    }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      margin: 2px 4px 2px 0;
      border-radius: 10px;
      font-size: 11px;
      background: var(--vscode-badge-background, #333);
      color: var(--vscode-badge-foreground, #fff);
    }
    .empty { opacity: 0.5; font-style: italic; }
  </style>
</head>
<body>
  <div class="header">
    <span class="name">${this.escapeHtml(String(data.name || instancePath))}</span>
    <span class="class">${this.escapeHtml(String(data.className || 'Unknown'))}</span>
  </div>

  <h2>Properties</h2>
  ${Object.keys(properties).length > 0
                ? `<table>${Object.entries(properties).map(([k, v]) =>
                    `<tr><td>${this.escapeHtml(k)}</td><td>${this.escapeHtml(this.formatValue(v))}</td></tr>`
                ).join('')}</table>`
                : '<p class="empty">No properties available</p>'
            }

  ${Object.keys(attributes).length > 0 ? `
  <h2>Attributes</h2>
  <table>${Object.entries(attributes).map(([k, v]) =>
                `<tr><td>${this.escapeHtml(k)}</td><td>${this.escapeHtml(this.formatValue(v))}</td></tr>`
            ).join('')}</table>` : ''}

  ${tags.length > 0 ? `
  <h2>Tags</h2>
  <div>${tags.map((t) => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}

  <h2>Info</h2>
  <table>
    <tr><td>Full Path</td><td>${this.escapeHtml(String(data.fullName || instancePath))}</td></tr>
    <tr><td>Children</td><td>${data.childCount ?? '?'}</td></tr>
  </table>
</body>
</html>`;
    }

    private formatValue(value: unknown): string {
        if (value === null || value === undefined) return 'nil';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    dispose(): void {
        this.panel?.dispose();
    }
}
