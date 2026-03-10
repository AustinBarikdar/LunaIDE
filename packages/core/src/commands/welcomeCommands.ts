import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WelcomePanel, PlaceData } from '../welcome/welcomePanel.js';
import { CreateProjectPanel } from '../welcome/createProjectPanel.js';
import { getWorkspaceRoot, detectPlaces, writeProfile, Profile, writePlacesConfig, writeProjectConfig } from '../utils/workspace.js';

export function registerWelcomeCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('lunaide.showWelcome', () => {
            const ws = getWorkspaceRoot();
            const names = ws ? detectPlaces(ws) : [];
            const active = context.workspaceState.get<string>('lunaide.activePlace');
            const placeData: PlaceData | undefined = names.length > 0 ? { names, active } : undefined;
            void WelcomePanel.createOrShow(context.extensionUri, placeData);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lunaide.createProject', () => {
            void CreateProjectPanel.createOrShow(context.extensionUri);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('lunaide.convertToMultiPlace', async () => {
            const ws = getWorkspaceRoot();
            if (!ws) return;

            const placeName = await vscode.window.showInputBox({
                title: 'Convert to Multi-Place',
                prompt: 'Enter the name for the primary place (e.g., MainGame)',
                value: 'StartPlace',
                validateInput: (v) => v.trim() ? undefined : 'Name cannot be empty'
            });
            if (!placeName?.trim()) return;

            const placeIdStr = await vscode.window.showInputBox({
                title: 'Convert to Multi-Place',
                prompt: 'Optional: Enter the Roblox Place ID',
                validateInput: (v) => {
                    if (!v.trim()) return undefined;
                    return /^\d+$/.test(v.trim()) ? undefined : 'Must be a numeric Place ID';
                }
            });
            const placeId = placeIdStr?.trim() ? parseInt(placeIdStr.trim(), 10) : undefined;

            try {
                const configPath = path.join(ws, 'default.project.json');
                const configRaw = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configRaw);

                // Reverse engineer profile from tree
                const profile: Profile = { name: 'Converted', services: {} };
                if (config.tree) {
                    for (const [key, value] of Object.entries(config.tree)) {
                        if (key !== '$className' && typeof value === 'object' && value !== null) {
                            const val = value as any;
                            if (val.$path) {
                                // Top level service mapping
                                profile.services[key] = { name: key, src: val.$path };
                            } else {
                                // Nested service check (like StarterPlayer.StarterPlayerScripts)
                                for (const [subKey, subValue] of Object.entries(val)) {
                                    if (subKey !== '$className' && typeof subValue === 'object' && subValue !== null) {
                                        const subVal = subValue as any;
                                        if (subVal.$path) {
                                            profile.services[`${key}.${subKey}`] = { name: subKey, src: subVal.$path };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Restructure Filesystem
                const placeDir = path.join(ws, placeName.trim());
                fs.mkdirSync(placeDir, { recursive: true });

                const oldSrc = path.join(ws, 'src');
                if (fs.existsSync(oldSrc)) {
                    const newSrc = path.join(placeDir, 'src');
                    try {
                        fs.renameSync(oldSrc, newSrc);
                    } catch (renameErr: any) {
                        if (renameErr.code === 'EXDEV') {
                            // Cross-device move: copy then delete
                            fs.cpSync(oldSrc, newSrc, { recursive: true });
                            fs.rmSync(oldSrc, { recursive: true, force: true });
                        } else {
                            throw renameErr;
                        }
                    }
                }

                // Generate Meta-files
                writeProfile(ws, profile);

                const placesConfig: Record<string, any> = {};
                placesConfig[placeName.trim()] = placeId ? { placeId } : {};
                writePlacesConfig(ws, placesConfig);

                // Rewrite project config using existing helper
                writeProjectConfig(ws, placeName.trim());

                // Update gitignore
                const gitignorePath = path.join(ws, '.gitignore');
                let ignores = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
                if (!ignores.includes('.lunaide/')) {
                    ignores += '\n# LunaIDE snapshots & profiles\n.lunaide/\nplaces.json\nprofile.json\n';
                    fs.writeFileSync(gitignorePath, ignores);
                }

                vscode.window.showInformationMessage('Successfully converted to LunaIDE Multi-Place. Reloading window...');
                setTimeout(() => vscode.commands.executeCommand('workbench.action.reloadWindow'), 1500);

            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to convert project: ${err.message}`);
            }
        })
    );
}
