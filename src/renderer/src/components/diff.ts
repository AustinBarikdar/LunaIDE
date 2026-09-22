/** One line of a unified diff, classified for styling. */
export type Line = { kind: 'file' | 'hunk' | 'add' | 'del' | 'ctx' | 'meta'; text: string }

export function parseDiff(diff: string): Line[] {
  return diff.split('\n').map((l) => {
    if (l.startsWith('diff --git'))
      return { kind: 'file', text: l.replace(/^diff --git a\/.* b\/(.*)$/, '$1') }
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

export type Note = { file: string; anchor: string; why: string; kind?: 'added' | 'removed' }
export type PlacedNote = { line: number; removed: boolean; step: number; why: string }

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const sameFile = (a: string, b: string): boolean => !!a && !!b && (b.endsWith(a) || a.endsWith(b))

/**
 * Where each note's bubble goes in `file`: the line whose text contains the anchor — an added
 * line if one matches, otherwise any line — or, for a removal, the deleted line that held it.
 * Steps keep their numbers from the full list, so the flow reads the same across files.
 */
export function placeNotes(
  doc: string,
  map: { added: number[]; deleted: { line: number; text: string }[] },
  notes: Note[],
  file: string
): PlacedNote[] {
  const lines = doc.split('\n')
  const added = new Set(map.added)
  const out: PlacedNote[] = []
  notes.forEach((n, i) => {
    if (!sameFile(n.file, file)) return
    const a = squash(n.anchor.split('\n')[0])
    if (!a) return
    const step = i + 1
    if (n.kind === 'removed') {
      const d = map.deleted.find((x) => squash(x.text).includes(a))
      if (d) out.push({ line: d.line, removed: true, step, why: n.why })
      return
    }
    let hit = lines.findIndex((l, idx) => added.has(idx + 1) && squash(l).includes(a))
    if (hit === -1) hit = lines.findIndex((l) => squash(l).includes(a))
    if (hit !== -1) out.push({ line: hit + 1, removed: false, step, why: n.why })
  })
  return out
}
