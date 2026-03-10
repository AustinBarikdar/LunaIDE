import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExtensionUpdater, ManagedExtension, extractVsix } from '../extensionUpdater.js';

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: vi.fn() };
});

const TEST_EXT: ManagedExtension = {
  id: 'TestPub.test-ext',
  publisher: 'TestPub',
  name: 'test-ext',
  displayName: 'Test Extension',
  platform: 'darwin-arm64',
};

describe('ExtensionUpdater.update', () => {
  let tmpDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-updater-test-'));
    extensionsDir = path.join(tmpDir, '.lunaide', 'extensions');
    fs.mkdirSync(extensionsDir, { recursive: true });

    // Create a fake "old version" folder with a package.json
    const oldDir = path.join(extensionsDir, 'testpub.test-ext-1.0.0');
    fs.mkdirSync(oldDir, { recursive: true });
    fs.writeFileSync(path.join(oldDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));

    vi.mocked(os.homedir).mockReturnValue(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('preserves old version when download URL validation fails', async () => {
    // Mock fetch to return 404 for all HEAD requests (simulating no VSIX available)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    // The update should throw because no download URL is found
    await expect(
      ExtensionUpdater.update(TEST_EXT, '2.0.0')
    ).rejects.toThrow('Could not find VSIX download');

    // The old version folder should still exist (this is the bug — currently it's deleted first)
    const oldDir = path.join(extensionsDir, 'testpub.test-ext-1.0.0');
    expect(fs.existsSync(oldDir)).toBe(true);
    expect(fs.existsSync(path.join(oldDir, 'package.json'))).toBe(true);
  });
});

describe('extractVsix', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-vsix-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('rejects when VSIX has no extension/ directory', async () => {
    // Create a zip that contains only a file at root level (no extension/ subdir)
    const { execFileSync } = await import('child_process');
    const zipContent = path.join(tmpDir, 'content');
    fs.mkdirSync(zipContent, { recursive: true });
    fs.writeFileSync(path.join(zipContent, '[Content_Types].xml'), '<Types/>');

    const vsixPath = path.join(tmpDir, 'test.vsix');
    execFileSync('zip', ['-j', vsixPath, path.join(zipContent, '[Content_Types].xml')]);

    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir, { recursive: true });

    await expect(
      extractVsix(vsixPath, targetDir)
    ).rejects.toThrow('No extension/ directory found in VSIX');
  });

  it('succeeds when VSIX has an extension/ directory', async () => {
    const { execFileSync } = await import('child_process');
    const zipContent = path.join(tmpDir, 'content');
    const extDir = path.join(zipContent, 'extension');
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, 'package.json'), '{"version":"1.0.0"}');

    const vsixPath = path.join(tmpDir, 'test.vsix');
    // Create zip preserving directory structure
    execFileSync('zip', ['-r', vsixPath, '.'], { cwd: zipContent });

    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(targetDir, { recursive: true });

    await extractVsix(vsixPath, targetDir);

    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
  });
});
