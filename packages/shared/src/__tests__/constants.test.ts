import { describe, it, expect } from 'vitest';
import {
  STUDIO_BRIDGE_PORT,
  ROJO_PROJECT_FILE,
  ROBLOXIDE_DIR,
  SESSIONS_DIR,
  INSTRUCTIONS_FILE,
  LOCK_EXPIRATION_MS,
  LUAU_EXTENSIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MAX_SNAPSHOTS,
  getBridgePortFile,
} from '../constants';

describe('constants', () => {
  it('has correct default values', () => {
    expect(STUDIO_BRIDGE_PORT).toBe(21026);
    expect(ROJO_PROJECT_FILE).toBe('default.project.json');
    expect(ROBLOXIDE_DIR).toBe('.lunaide');
    expect(SESSIONS_DIR).toBe('sessions');
    expect(INSTRUCTIONS_FILE).toBe('.lunaide/instructions.md');
    expect(LOCK_EXPIRATION_MS).toBe(300_000);
    expect(LUAU_EXTENSIONS).toEqual(['.luau', '.lua']);
    expect(MCP_SERVER_NAME).toBe('roblox-ide-mcp');
    expect(MCP_SERVER_VERSION).toBe('0.1.0');
    expect(MAX_SNAPSHOTS).toBe(100);
  });
});

describe('getBridgePortFile', () => {
  it('returns a deterministic path for a given workspace', () => {
    const result1 = getBridgePortFile('/home/user/project');
    const result2 = getBridgePortFile('/home/user/project');
    expect(result1).toBe(result2);
  });

  it('returns different paths for different workspaces', () => {
    const result1 = getBridgePortFile('/home/user/project-a');
    const result2 = getBridgePortFile('/home/user/project-b');
    expect(result1).not.toBe(result2);
  });

  it('includes the lunaide-bridge prefix', () => {
    const result = getBridgePortFile('/some/path');
    expect(result).toMatch(/lunaide-bridge-[0-9a-f]{8}\.port$/);
  });

  it('lowercases paths on win32', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const upper = getBridgePortFile('C:\\Users\\Test\\Project');
      const lower = getBridgePortFile('c:\\users\\test\\project');
      expect(upper).toBe(lower);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});
