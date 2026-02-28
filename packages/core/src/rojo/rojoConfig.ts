import * as fs from 'fs';
import * as path from 'path';
import { RojoProject, RojoTreeNode, RobloxInstance } from '@roblox-ide/shared';

/**
 * Parse a Rojo project file (default.project.json).
 */
export function parseRojoProject(projectPath: string): RojoProject | null {
  try {
    const content = fs.readFileSync(projectPath, 'utf-8');
    return JSON.parse(content) as RojoProject;
  } catch {
    return null;
  }
}

/**
 * Build an instance tree from a Rojo project and the filesystem.
 */
export function buildInstanceTree(project: RojoProject, workspaceRoot: string): RobloxInstance {
  const root: RobloxInstance = {
    name: project.name,
    className: 'DataModel',
    path: '',
    children: [],
  };

  buildTreeRecursive(project.tree, root, workspaceRoot, '');
  return root;
}

function buildTreeRecursive(
  node: RojoTreeNode,
  parent: RobloxInstance,
  workspaceRoot: string,
  currentPath: string
): void {
  for (const [key, value] of Object.entries(node)) {
    // Skip Rojo metadata keys
    if (key.startsWith('$')) continue;

    const childNode = value as RojoTreeNode;
    const childPath = currentPath ? `${currentPath}.${key}` : key;
    const className = childNode.$className || inferClassName(key, childNode, workspaceRoot);

    const instance: RobloxInstance = {
      name: key,
      className,
      path: childPath,
      children: [],
    };

    // Resolve filesystem path if $path is specified
    if (childNode.$path) {
      const fsPath = typeof childNode.$path === 'string'
        ? childNode.$path
        : (childNode.$path.required || childNode.$path.optional || '');

      const fullPath = path.join(workspaceRoot, fsPath);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDirectory(fullPath, instance, workspaceRoot);
        }
      }
    }

    // Process nested nodes
    buildTreeRecursive(childNode, instance, workspaceRoot, childPath);

    parent.children.push(instance);
  }
}

function scanDirectory(dirPath: string, parent: RobloxInstance, workspaceRoot: string): void {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        // Check for init.luau or init.lua
        const hasInit = fs.existsSync(path.join(fullPath, 'init.luau'))
          || fs.existsSync(path.join(fullPath, 'init.lua'));

        const instance: RobloxInstance = {
          name: entry.name,
          className: hasInit ? 'ModuleScript' : 'Folder',
          path: relativePath,
          children: [],
        };

        scanDirectory(fullPath, instance, workspaceRoot);
        parent.children.push(instance);
      } else if (entry.isFile()) {
        const ext = getScriptExtension(entry.name);
        if (ext) {
          const scriptName = entry.name.replace(ext, '');
          if (scriptName === 'init') continue; // Handled by parent directory

          const instance: RobloxInstance = {
            name: scriptName,
            className: getClassNameForExtension(ext),
            path: relativePath,
            children: [],
          };
          parent.children.push(instance);
        }
      }
    }
  } catch {
    // Silently skip unreadable directories
  }
}

function inferClassName(name: string, node: RojoTreeNode, _workspaceRoot: string): string {
  if (node.$path) return 'Folder';

  // Common Roblox service names
  const services: Record<string, string> = {
    Workspace: 'Workspace',
    ServerScriptService: 'ServerScriptService',
    ServerStorage: 'ServerStorage',
    ReplicatedStorage: 'ReplicatedStorage',
    ReplicatedFirst: 'ReplicatedFirst',
    StarterGui: 'StarterGui',
    StarterPack: 'StarterPack',
    StarterPlayer: 'StarterPlayer',
    StarterPlayerScripts: 'StarterPlayerScripts',
    StarterCharacterScripts: 'StarterCharacterScripts',
    Players: 'Players',
    Lighting: 'Lighting',
    SoundService: 'SoundService',
    Chat: 'Chat',
    Teams: 'Teams',
    TestService: 'TestService',
    HttpService: 'HttpService',
  };

  return services[name] || 'Folder';
}

function getScriptExtension(fileName: string): string | null {
  const extensions = ['.server.luau', '.server.lua', '.client.luau', '.client.lua', '.luau', '.lua'];
  for (const ext of extensions) {
    if (fileName.endsWith(ext)) return ext;
  }
  return null;
}

function getClassNameForExtension(ext: string): string {
  if (ext.includes('.server.')) return 'Script';
  if (ext.includes('.client.')) return 'LocalScript';
  return 'ModuleScript';
}
