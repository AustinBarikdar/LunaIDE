/** Rojo connection states */
export type RojoConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

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

/** Snapshot metadata (stored in session index) */
export interface SnapshotMeta {
  id: string;
  timestamp: number;
  description: string;
  fileCount: number;
}
