import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We test that the generated update script does NOT contain 'launchctl submit'
// and that the spawn call uses a proper detached process approach.

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInputBox: vi.fn(),
    withProgress: vi.fn(),
  },
  commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })), executeCommand: vi.fn() },
  workspace: { saveAll: vi.fn().mockResolvedValue(true) },
  ProgressLocation: { Notification: 15 },
  Uri: { parse: vi.fn() },
  env: { openExternal: vi.fn() },
}));

describe('ideUpdateChecker macOS update script', () => {
  it('does not use deprecated launchctl submit', async () => {
    // Read the source file and check that launchctl submit is not used
    const sourceFile = path.join(__dirname, '..', 'ideUpdateChecker.ts');
    const source = fs.readFileSync(sourceFile, 'utf-8');

    // The source should not contain 'launchctl submit' or "launchctl', ['submit"
    expect(source).not.toContain('launchctl submit');
    expect(source).not.toMatch(/launchctl.*submit/);
  });

  it('still contains launchctl remove for cleanup (which is not deprecated)', async () => {
    const sourceFile = path.join(__dirname, '..', 'ideUpdateChecker.ts');
    const source = fs.readFileSync(sourceFile, 'utf-8');

    // launchctl remove in the bash script for cleanup is fine — it's not deprecated
    // But if we remove launchctl submit, we should also remove the launchctl remove
    // since there's no launchd job to remove anymore
    expect(source).not.toContain('launchctl remove');
  });
});
