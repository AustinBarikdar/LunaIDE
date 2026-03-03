/** Rojo connection states */
export type RojoConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Rojo project configuration (default.project.json) */
export interface RojoProject {
  name: string;
  tree: RojoTreeNode;
  servePort?: number;
  servePlaceIds?: number[];
  globIgnorePaths?: string[];
}

export interface RojoTreeNode {
  $className?: string;
  $path?: string | { optional?: string; required?: string };
  $properties?: Record<string, unknown>;
  $ignoreUnknownInstances?: boolean;
  [key: string]: unknown;
}

/** Studio connection info */
export interface StudioInstance {
  id: string;
  pid: number;
  port: number;
  placeName?: string;
  connected: boolean;
  lastSeen: number;
}

/** Session snapshot for undo/redo */
export interface SessionSnapshot {
  id: string;
  timestamp: number;
  description: string;
  changes: FileChange[];
}

export interface FileChange {
  filePath: string;
  before: string;
  after: string;
}

/** Luau diagnostic from LSP */
export interface LuauDiagnostic {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  code?: string | number;
}

/** Roblox instance representation */
export interface RobloxInstance {
  name: string;
  className: string;
  path: string;
  children: RobloxInstance[];
  properties?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  tags?: string[];
}

/** Snapshot metadata (stored in session index) */
export interface SnapshotMeta {
  id: string;
  timestamp: number;
  description: string;
  fileCount: number;
}
