/** One line of a unified diff, classified for styling. */
export type Line = { kind: 'file' | 'hunk' | 'add' | 'del' | 'ctx' | 'meta'; text: string }

export function parseDiff(diff: string): Line[] {
  return diff.split('\n').map((l) => {
    if (l.startsWith('diff --git'))
      return { kind: 'file', text: l.replace(/^diff --git a\/(.*) b\/.*$/, '$1') }
    if (l.startsWith('@@')) return { kind: 'hunk', text: l }
    if (
      l.startsWith('+++') ||
      l.startsWith('---') ||
      l.startsWith('index ') ||
      /^(new|deleted) file/.test(l)
    )
      return { kind: 'meta', text: l }
    if (l.startsWith('+')) return { kind: 'add', text: l.slice(1) }
    if (l.startsWith('-')) return { kind: 'del', text: l.slice(1) }
    return { kind: 'ctx', text: l.startsWith(' ') ? l.slice(1) : l }
  })
}

/** Split a multi-file unified diff into per-file chunks. */
export function splitByFile(diff: string): { path: string; diff: string }[] {
  const out: { path: string; diff: string }[] = []
  for (const chunk of diff.split(/^(?=diff --git )/m)) {
    const m = chunk.match(/^diff --git a\/(.*?) b\/(.*)$/m)
    if (m) out.push({ path: m[2], diff: chunk.trimEnd() })
  }
  return out
}

/** Map one file's diff onto new-file line numbers (1-based) for editor overlays. */
export function diffLineMap(fileDiff: string): {
  added: number[]
  deleted: { line: number; text: string }[]
} {
  const added: number[] = []
  const deleted: { line: number; text: string }[] = []
  let line = 0
  let inHunk = false
  for (const l of fileDiff.split('\n')) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (h) {
      line = Number(h[1])
      inHunk = true
      continue
    }
    if (!inHunk || l.startsWith('\\')) continue
    if (l.startsWith('+')) added.push(line++)
    else if (l.startsWith('-')) deleted.push({ line, text: l.slice(1) })
    else line++
  }
  return { added, deleted }
}
