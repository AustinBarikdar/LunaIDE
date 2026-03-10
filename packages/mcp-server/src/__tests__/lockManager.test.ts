import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LockManager } from '../locking/lockManager';

describe('LockManager', () => {
  let manager: LockManager;

  beforeEach(() => {
    manager = new LockManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquire', () => {
    it('returns a lock token', () => {
      const token = manager.acquire('file.luau', 'agent-1');
      expect(token).toMatch(/^lock_/);
    });

    it('returns the same token when the same agent re-acquires', () => {
      const token1 = manager.acquire('file.luau', 'agent-1');
      const token2 = manager.acquire('file.luau', 'agent-1');
      expect(token1).toBe(token2);
    });

    it('throws when a different agent tries to acquire', () => {
      manager.acquire('file.luau', 'agent-1');
      expect(() => manager.acquire('file.luau', 'agent-2')).toThrow(
        /locked by agent "agent-1"/
      );
    });
  });

  describe('release', () => {
    it('succeeds for the owning agent', () => {
      manager.acquire('file.luau', 'agent-1');
      expect(manager.release('file.luau', 'agent-1')).toBe(true);
    });

    it('throws when a non-owner tries to release', () => {
      manager.acquire('file.luau', 'agent-1');
      expect(() => manager.release('file.luau', 'agent-2')).toThrow(
        /locked by agent "agent-1"/
      );
    });

    it('returns true if already unlocked', () => {
      expect(manager.release('nonexistent.luau', 'agent-1')).toBe(true);
    });
  });

  describe('checkLock', () => {
    it('returns lock info when locked', () => {
      manager.acquire('file.luau', 'agent-1');
      const lock = manager.checkLock('file.luau');
      expect(lock).not.toBeNull();
      expect(lock!.agentId).toBe('agent-1');
      expect(lock!.filePath).toBe('file.luau');
    });

    it('returns null when unlocked', () => {
      expect(manager.checkLock('file.luau')).toBeNull();
    });
  });

  describe('expiration', () => {
    it('prunes expired locks', () => {
      manager.acquire('file.luau', 'agent-1');
      expect(manager.checkLock('file.luau')).not.toBeNull();

      // Advance past the 5-minute expiration
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(manager.checkLock('file.luau')).toBeNull();
    });

    it('allows another agent to acquire after expiration', () => {
      manager.acquire('file.luau', 'agent-1');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const token = manager.acquire('file.luau', 'agent-2');
      expect(token).toMatch(/^lock_/);
      expect(manager.checkLock('file.luau')!.agentId).toBe('agent-2');
    });
  });
});
