import { describe, it, expect, vi, afterEach } from 'vitest';
import { getLatestGitHubRelease } from '../toolUpdateChecker.js';

// Mock vscode module since it's not available in test environment
vi.mock('vscode', () => ({
  window: { showInformationMessage: vi.fn(), showErrorMessage: vi.fn(), showWarningMessage: vi.fn(), createStatusBarItem: vi.fn(), showQuickPick: vi.fn(), withProgress: vi.fn() },
  commands: { registerCommand: vi.fn(), executeCommand: vi.fn() },
  StatusBarAlignment: { Right: 2 },
  ProgressLocation: { Notification: 15 },
  Uri: { parse: vi.fn() },
  env: { openExternal: vi.fn() },
}));

// Mock https to avoid real network calls
vi.mock('https', () => ({
  get: vi.fn(),
}));

describe('getLatestGitHubRelease', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles context.secrets.get errors gracefully without unhandled rejection', async () => {
    const https = await import('https');

    // After the secrets error is caught, https.get will still be called (without auth).
    // Return a response that yields a valid release.
    vi.mocked(https.get).mockImplementation((opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      const fakeRes = {
        statusCode: 200,
        headers: {},
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify([{ tag_name: 'v1.0.0' }])));
          }
          if (event === 'end') {
            handler();
          }
          return fakeRes;
        }),
      };
      if (callback) callback(fakeRes);
      const req = { on: vi.fn().mockReturnThis(), destroy: vi.fn() };
      return req as any;
    });

    const fakeContext = {
      secrets: {
        get: vi.fn().mockRejectedValue(new Error('secrets store corrupted')),
      },
      globalState: { get: vi.fn(), update: vi.fn() },
    };

    // With the old `new Promise(async ...)` anti-pattern, the secrets error
    // became an unhandled rejection. After the fix, it's caught and the
    // function continues without auth, returning a valid result.
    const result = await getLatestGitHubRelease('rojo-rbx/rojo', fakeContext as any);

    // Should succeed without auth header
    expect(result).toBe('1.0.0');

    // Verify https.get was called without Authorization header
    const callArgs = vi.mocked(https.get).mock.calls[0][0] as any;
    expect(callArgs.headers?.Authorization).toBeUndefined();
  });

  it('returns version string on successful API response', async () => {
    const https = await import('https');

    vi.mocked(https.get).mockImplementation((opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      // Simulate a successful response with release data
      const fakeRes = {
        statusCode: 200,
        headers: {},
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify([{ tag_name: 'v7.8.0' }])));
          }
          if (event === 'end') {
            handler();
          }
          return fakeRes;
        }),
      };
      if (callback) callback(fakeRes);
      const req = { on: vi.fn().mockReturnThis(), destroy: vi.fn() };
      return req as any;
    });

    const result = await getLatestGitHubRelease('rojo-rbx/rojo');
    expect(result).toBe('7.8.0');
  });
});
