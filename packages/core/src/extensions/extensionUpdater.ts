import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

export interface ManagedExtension {
    id: string;          // e.g. "JohnnyMorganz.luau-lsp"
    publisher: string;   // e.g. "JohnnyMorganz"
    name: string;        // e.g. "luau-lsp"
    displayName: string; // e.g. "Luau Language Server"
    platform: string;    // e.g. "darwin-arm64"
}

function getExtensionPlatform(): string {
    const os = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return `${os}-${arch}`;
}

export const MANAGED_EXTENSIONS: ManagedExtension[] = [
    {
        id: 'JohnnyMorganz.luau-lsp',
        publisher: 'JohnnyMorganz',
        name: 'luau-lsp',
        displayName: 'Luau Language Server',
        platform: getExtensionPlatform(),
    },
];

export class ExtensionUpdater {
    /**
     * Get the installed version by reading package.json from
     * ~/.lunaide/extensions/{publisher}.{name}-{version}/ folder.
     */
    static getInstalledVersion(ext: ManagedExtension): string | null {
        const extensionsDir = path.join(os.homedir(), '.lunaide', 'extensions');
        if (!fs.existsSync(extensionsDir)) return null;

        const prefix = `${ext.publisher.toLowerCase()}.${ext.name.toLowerCase()}-`;
        let entries: string[];
        try {
            entries = fs.readdirSync(extensionsDir);
        } catch {
            return null;
        }

        for (const entry of entries) {
            if (entry.toLowerCase().startsWith(prefix)) {
                const pkgJson = path.join(extensionsDir, entry, 'package.json');
                if (fs.existsSync(pkgJson)) {
                    try {
                        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8')) as { version?: string };
                        return pkg.version ?? null;
                    } catch {
                        return null;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Query Open VSX API for the latest version of the extension.
     * Returns null if the check fails.
     */
    static async getLatestVersion(ext: ManagedExtension): Promise<string | null> {
        try {
            const url = `https://open-vsx.org/api/${ext.publisher}/${ext.name}?targetPlatform=${ext.platform}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) return null;
            const json = await response.json() as { version?: string };
            return json.version ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Download and extract the latest VSIX into ~/.lunaide/extensions/.
     * Removes the old version folder first.
     */
    static async update(ext: ManagedExtension, latestVersion: string): Promise<void> {
        const extensionsDir = path.join(os.homedir(), '.lunaide', 'extensions');
        fs.mkdirSync(extensionsDir, { recursive: true });

        // Remove old version folder(s)
        const prefix = `${ext.publisher.toLowerCase()}.${ext.name.toLowerCase()}-`;
        for (const entry of fs.readdirSync(extensionsDir)) {
            if (entry.toLowerCase().startsWith(prefix)) {
                fs.rmSync(path.join(extensionsDir, entry), { recursive: true, force: true });
            }
        }

        // Download VSIX — try platform-specific first, then generic
        const vsixNamePlatform = `${ext.publisher}.${ext.name}-${latestVersion}@${ext.platform}.vsix`;
        const vsixNameGeneric  = `${ext.publisher}.${ext.name}-${latestVersion}.vsix`;

        let downloadUrl: string | null = null;
        let vsixName: string = vsixNamePlatform;

        for (const name of [vsixNamePlatform, vsixNameGeneric]) {
            const candidate = `https://open-vsx.org/api/${ext.publisher}/${ext.name}/${latestVersion}/file/${name}`;
            const headResp = await fetch(candidate, { method: 'HEAD' });
            if (headResp.ok) {
                downloadUrl = candidate;
                vsixName = name;
                break;
            }
        }

        if (!downloadUrl) {
            throw new Error(`Could not find VSIX download for ${ext.id} v${latestVersion}`);
        }

        const tmpFile = path.join(os.tmpdir(), vsixName);
        await downloadFile(downloadUrl, tmpFile);

        // Extract VSIX (ZIP) — the extension lives in the "extension/" subfolder
        const targetDir = path.join(
            extensionsDir,
            `${ext.publisher.toLowerCase()}.${ext.name}-${latestVersion}`
        );
        fs.mkdirSync(targetDir, { recursive: true });

        await extractVsix(tmpFile, targetDir);

        fs.rmSync(tmpFile, { force: true });
    }
}

async function downloadFile(url: string, dest: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(dest, buffer);
}

function extractVsix(vsixPath: string, targetDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // VSIX is a ZIP. Contents are under an "extension/" subdirectory.
        const tmpExtract = vsixPath + '_extract';
        const onExtracted = () => {
            const extSrc = path.join(tmpExtract, 'extension');
            if (fs.existsSync(extSrc)) {
                copyDir(extSrc, targetDir);
            }
            fs.rmSync(tmpExtract, { recursive: true, force: true });
            resolve();
        };

        if (process.platform === 'win32') {
            execFile('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${vsixPath}' -DestinationPath '${tmpExtract}' -Force`], (err) => {
                if (err) { reject(err); return; }
                onExtracted();
            });
        } else {
            execFile('unzip', ['-q', '-o', vsixPath, '-d', tmpExtract], (err) => {
                if (err) { reject(err); return; }
                onExtracted();
            });
        }
    });
}

function copyDir(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
