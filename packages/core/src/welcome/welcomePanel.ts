import * as vscode from 'vscode';
import * as path from 'path';

export class WelcomePanel {
    public static currentPanel: WelcomePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.html = this._getHtmlForWebview();

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'createProject':
                        vscode.commands.executeCommand('lunaide.createProject', message.projectName);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WelcomePanel.currentPanel) {
            WelcomePanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'lunaIdeWelcome',
            'Welcome - LunaIDE',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media'), vscode.Uri.joinPath(extensionUri, 'dist')]
            }
        );

        WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
    }

    public dispose() {
        WelcomePanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to LunaIDE</title>
    <style>
        :root {
            --bg-color: #11111B;
            --card-bg: rgba(30, 30, 46, 0.7);
            --card-border: rgba(255, 255, 255, 0.1);
            --text-main: #CDD6F4;
            --text-muted: #A6ADC8;
            --accent-start: #74C7EC;
            --accent-mid: #89B4FA;
            --accent-end: #CBA6F7;
            --input-bg: rgba(0, 0, 0, 0.3);
            --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(circle at 15% 50%, rgba(116, 199, 236, 0.1), transparent 25%),
                radial-gradient(circle at 85% 30%, rgba(203, 166, 247, 0.15), transparent 25%);
            font-family: var(--font-family);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            width: 100%;
            max-width: 600px;
            padding: 20px;
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            padding: 40px;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, var(--accent-start), var(--accent-mid), var(--accent-end));
            opacity: 0.7;
        }

        .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            gap: 15px;
        }

        .logo-svg {
            width: 48px;
            height: 48px;
        }

        h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(90deg, #fff, #CDD6F4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        p {
            color: var(--text-muted);
            font-size: 16px;
            margin-top: 10px;
            margin-bottom: 40px;
        }

        .input-group {
            display: flex;
            flex-direction: column;
            gap: 20px;
            align-items: center;
        }

        input[type="text"] {
            width: 100%;
            max-width: 400px;
            background: var(--input-bg);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: var(--text-main);
            padding: 16px 20px;
            border-radius: 12px;
            font-size: 16px;
            outline: none;
            transition: all 0.2s ease;
            box-sizing: border-box;
        }

        input[type="text"]:focus {
            border-color: var(--accent-mid);
            box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.2);
        }

        input[type="text"]::placeholder {
            color: rgba(166, 173, 200, 0.5);
        }

        button {
            background: linear-gradient(135deg, var(--accent-mid), var(--accent-end));
            color: #11111B;
            border: none;
            padding: 16px 32px;
            font-size: 18px;
            font-weight: 600;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 15px rgba(203, 166, 247, 0.3);
            width: 100%;
            max-width: 400px;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(203, 166, 247, 0.4);
            filter: brightness(1.1);
        }

        button:active {
            transform: translateY(1px);
        }

        /* Twinkling stars effect */
        .star {
            position: absolute;
            background: white;
            border-radius: 50%;
            animation: twinkle infinite ease-in-out;
            opacity: 0;
        }

        @keyframes twinkle {
            0% { opacity: 0; transform: scale(0.5); }
            50% { opacity: 0.8; transform: scale(1); box-shadow: 0 0 10px white; }
            100% { opacity: 0; transform: scale(0.5); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="logo-container">
                <svg class="logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="moonGrad" x1="20%" y1="0%" x2="80%" y2="100%">
                            <stop offset="0%" stop-color="#74C7EC" />
                            <stop offset="50%" stop-color="#89B4FA" />
                            <stop offset="100%" stop-color="#CBA6F7" />
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <path d="M 60 20 A 30 30 0 1 0 80 75 A 35 35 0 1 1 60 20 Z" fill="url(#moonGrad)" filter="url(#glow)"/>
                </svg>
                <h1>Welcome to LunaIDE</h1>
            </div>
            
            <p>Start your next masterpiece with LunaIDE.</p>

            <div class="input-group">
                <input type="text" id="projectName" placeholder="My Awesome Game" autocomplete="off" spellcheck="false" />
                <button id="createBtn">Create New Project</button>
            </div>

            <!-- Decorative stars -->
            <div class="star" style="top: 20%; left: 10%; width: 3px; height: 3px; animation-duration: 3s; animation-delay: 0s;"></div>
            <div class="star" style="top: 15%; right: 15%; width: 4px; height: 4px; animation-duration: 4s; animation-delay: 1s;"></div>
            <div class="star" style="bottom: 25%; left: 15%; width: 2px; height: 2px; animation-duration: 2.5s; animation-delay: 2s;"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const createBtn = document.getElementById('createBtn');
        const projectNameInput = document.getElementById('projectName');

        function submitProject() {
            const name = projectNameInput.value.trim() || 'My_LunaIDE_Project';
            vscode.postMessage({
                command: 'createProject',
                projectName: name
            });
        }

        createBtn.addEventListener('click', submitProject);
        
        projectNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitProject();
            }
        });

        // Focus input on load
        setTimeout(() => projectNameInput.focus(), 100);
    </script>
</body>
</html>`;
    }
}
