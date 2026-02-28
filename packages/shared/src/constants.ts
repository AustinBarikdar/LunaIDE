/** Default port for Rojo serve */
export const ROJO_DEFAULT_PORT = 34872;

/** Default port for Studio plugin communication */
export const STUDIO_BRIDGE_PORT = 21026;

/** Default Rojo project file name */
export const ROJO_PROJECT_FILE = 'default.project.json';

/** Directory for LunaIDE workspace data */
export const ROBLOXIDE_DIR = '.lunaide';

/** Session snapshots directory (relative to ROBLOXIDE_DIR) */
export const SESSIONS_DIR = 'sessions';

/** Persistent instructions file (relative to workspace root) */
export const INSTRUCTIONS_FILE = '.lunaide/instructions.md';

/** File lock expiration time in milliseconds (5 minutes) */
export const LOCK_EXPIRATION_MS = 5 * 60 * 1000;

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/** Heartbeat timeout in milliseconds */
export const HEARTBEAT_TIMEOUT_MS = 5_000;

/** Studio plugin poll interval in milliseconds */
export const STUDIO_POLL_INTERVAL_MS = 500;

/** Circuit breaker: max consecutive failures before opening */
export const CIRCUIT_BREAKER_THRESHOLD = 5;

/** Circuit breaker: cooldown period in milliseconds */
export const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

/** Reconnection backoff: initial delay in milliseconds */
export const RECONNECT_INITIAL_DELAY_MS = 1_000;

/** Reconnection backoff: maximum delay in milliseconds */
export const RECONNECT_MAX_DELAY_MS = 30_000;

/** Luau file extensions */
export const LUAU_EXTENSIONS = ['.luau', '.lua'] as const;

/** Rojo file extension mapping */
export const ROJO_FILE_TYPES = {
  '.server.luau': 'Script',
  '.server.lua': 'Script',
  '.client.luau': 'LocalScript',
  '.client.lua': 'LocalScript',
  '.luau': 'ModuleScript',
  '.lua': 'ModuleScript',
} as const;

/** MCP server name */
export const MCP_SERVER_NAME = 'roblox-ide-mcp';

/** MCP server version */
export const MCP_SERVER_VERSION = '0.1.0';

/** Bridge port file path (relative to workspace) */
export const BRIDGE_PORT_FILE = '.lunaide/.port';

/** Default max session snapshots */
export const MAX_SNAPSHOTS = 100;
