import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ProfileService {
    name: string;
    src: string;
}

export interface Profile {
    name: string;
    services: Record<string, ProfileService>;
}

export const BUILT_IN_PROFILES: Record<string, Profile> = {
    Standard: {
        name: 'Standard',
        services: {
            ServerScriptService: { name: 'Server', src: 'src/server' },
            ReplicatedStorage: { name: 'Shared', src: 'src/shared' },
            'StarterPlayer.StarterPlayerScripts': { name: 'Client', src: 'src/client' },
        },
    },
    Complete: {
        name: 'Complete',
        services: {
            ServerScriptService: { name: 'ServerScriptService', src: 'src/ServerScriptService' },
            ServerStorage: { name: 'ServerStorage', src: 'src/ServerStorage' },
            ReplicatedStorage: { name: 'ReplicatedStorage', src: 'src/ReplicatedStorage' },
            ReplicatedFirst: { name: 'ReplicatedFirst', src: 'src/ReplicatedFirst' },
            StarterPlayer: { name: 'StarterPlayer', src: 'src/StarterPlayer' },
            StarterGui: { name: 'StarterGui', src: 'src/StarterGui' },
            StarterPack: { name: 'StarterPack', src: 'src/StarterPack' },
            Workspace: { name: 'Workspace', src: 'src/Workspace' },
            Lighting: { name: 'Lighting', src: 'src/Lighting' },
            SoundService: { name: 'SoundService', src: 'src/SoundService' },
        },
    },
    Minimal: {
        name: 'Minimal',
        services: {
            ReplicatedStorage: { name: 'Shared', src: 'src/shared' },
            ServerScriptService: { name: 'Server', src: 'src/server' },
        },
    },
};

export function readPlacesConfig(workspaceFolder: string): Record<string, { placeId?: number }> {
    const cfgPath = path.join(workspaceFolder, '.lunaide', 'places.json');
    try {
        return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    } catch {
        return {};
    }
}

export function writePlacesConfig(workspaceFolder: string, config: Record<string, { placeId?: number }>): void {
    const dir = path.join(workspaceFolder, '.lunaide');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'places.json'), JSON.stringify(config, null, 2));
}

export function readProfile(workspaceFolder: string): Profile {
    const profilePath = path.join(workspaceFolder, '.lunaide', 'profile.json');
    try {
        const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        if (data && data.services) return data as Profile;
    } catch { /* fall through */ }
    return BUILT_IN_PROFILES['Standard'];
}

export function writeProfile(workspaceFolder: string, profile: Profile): void {
    const dir = path.join(workspaceFolder, '.lunaide');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2));
}

export function getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return undefined;
    return folders[0].uri.fsPath;
}

export function detectPlaces(workspaceFolder: string): string[] {
    try {
        return fs.readdirSync(workspaceFolder, { withFileTypes: true })
            .filter((e: fs.Dirent) => e.isDirectory() && !e.name.startsWith('.') &&
                fs.existsSync(path.join(workspaceFolder, e.name, 'src')))
            .map((e: fs.Dirent) => e.name)
            .sort();
    } catch { return []; }
}

export async function createPlace(workspaceFolder: string, name: string, placeId?: number): Promise<void> {
    const profile = readProfile(workspaceFolder);
    const placeDir = path.join(workspaceFolder, name);
    const placeUri = vscode.Uri.file(placeDir);

    for (const svc of Object.values(profile.services)) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(placeUri, svc.src));
    }

    if (profile.services['ServerScriptService']) {
        const serverSrc = profile.services['ServerScriptService'].src;
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(placeUri, `${serverSrc}/init.server.luau`),
            Buffer.from('-- Server entry point\n')
        );
    }
    if (profile.services['StarterPlayer.StarterPlayerScripts']) {
        const clientSrc = profile.services['StarterPlayer.StarterPlayerScripts'].src;
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(placeUri, `${clientSrc}/init.client.luau`),
            Buffer.from('-- Client entry point\n')
        );
    }

    const placesConfig = readPlacesConfig(workspaceFolder);
    placesConfig[name] = placeId ? { placeId } : {};
    writePlacesConfig(workspaceFolder, placesConfig);
}

export function writeProjectConfig(workspaceFolder: string, placeName: string): void {
    const profile = readProfile(workspaceFolder);
    const tree: Record<string, any> = { $className: 'DataModel' };

    for (const [serviceKey, svc] of Object.entries(profile.services)) {
        const parts = serviceKey.split('.');
        if (parts.length === 2) {
            const [parent, child] = parts;
            if (!tree[parent]) tree[parent] = { $className: parent };
            tree[parent][child] = {
                $className: child,
                $path: `${placeName}/${svc.src}`,
            };
        } else {
            tree[serviceKey] = {
                $className: serviceKey,
                $path: `${placeName}/${svc.src}`,
            };
        }
    }

    const config = { name: placeName, tree };
    fs.writeFileSync(
        path.join(workspaceFolder, 'default.project.json'),
        JSON.stringify(config, null, 2)
    );
}
