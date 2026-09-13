import { execFile } from 'child_process'

/** Run a command through the user's login shell so PATH matches their terminal (nvm, ~/.local/bin). */
export function sh(
  cmd: string,
  opts: { cwd?: string; input?: string } = {}
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      process.env.SHELL ?? '/bin/zsh',
      ['-lc', cmd],
      { cwd: opts.cwd, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve({
          code: err ? ((err as { code?: number }).code ?? 1) : 0,
          out: String(stdout) + String(stderr)
        })
    )
    if (opts.input !== undefined) child.stdin?.end(opts.input)
  })
}

export const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
