import { LOCK_EXPIRATION_MS } from '@roblox-ide/shared';

interface FileLock {
    filePath: string;
    agentId: string;
    token: string;
    acquiredAt: number;
    expiresAt: number;
}

/**
 * In-memory file lock manager for multi-agent safety.
 * Locks auto-expire after 5 minutes to prevent deadlocks.
 */
export class LockManager {
    private locks: Map<string, FileLock> = new Map();

    /**
     * Acquire a lock on a file for a specific agent.
     * Returns a lock token on success, or throws if already locked by another agent.
     */
    acquire(filePath: string, agentId: string): string {
        this.pruneExpired();

        const existing = this.locks.get(filePath);
        if (existing) {
            if (existing.agentId === agentId) {
                // Refresh the lock
                existing.expiresAt = Date.now() + LOCK_EXPIRATION_MS;
                return existing.token;
            }
            throw new Error(
                `File "${filePath}" is locked by agent "${existing.agentId}" ` +
                `(expires in ${Math.ceil((existing.expiresAt - Date.now()) / 1000)}s). ` +
                `Wait for it to be released or expire.`
            );
        }

        const token = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        this.locks.set(filePath, {
            filePath,
            agentId,
            token,
            acquiredAt: Date.now(),
            expiresAt: Date.now() + LOCK_EXPIRATION_MS,
        });

        return token;
    }

    /**
     * Release a lock. Only the agent that acquired it (or with the correct token) can release it.
     */
    release(filePath: string, agentId: string): boolean {
        const lock = this.locks.get(filePath);
        if (!lock) return true; // Already unlocked
        if (lock.agentId !== agentId) {
            throw new Error(
                `Cannot release lock on "${filePath}": locked by agent "${lock.agentId}", ` +
                `not "${agentId}".`
            );
        }
        this.locks.delete(filePath);
        return true;
    }

    /**
     * Check if a file is locked, and if so by whom.
     * Returns null if unlocked.
     */
    checkLock(filePath: string): FileLock | null {
        this.pruneExpired();
        return this.locks.get(filePath) || null;
    }

    /**
     * Remove expired locks.
     */
    private pruneExpired(): void {
        const now = Date.now();
        for (const [path, lock] of this.locks.entries()) {
            if (lock.expiresAt <= now) {
                this.locks.delete(path);
            }
        }
    }
}
