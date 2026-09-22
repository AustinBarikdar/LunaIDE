// Pure shaping of language-server answers, kept apart from lsp.ts so it can be tested in plain node.

export type Marked =
  string | { language?: string; value: string } | { kind?: string; value: string }
/** Hover contents come as a string, a marked object, or a list of either: one plain block. */
export function hoverText(contents: Marked | Marked[] | null | undefined): string {
  const parts = (Array.isArray(contents) ? contents : [contents]).map((c) =>
    !c ? '' : typeof c === 'string' ? c : c.value
  )
  return parts
    .join('\n\n')
    .replace(/```\w*\n?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type Location = { path: string; line: number; ch: number }
export type LspLocation = { uri: string; range: { start: { line: number; character: number } } }
export type LspLink = { targetUri: string; targetSelectionRange: LspLocation['range'] }
/** Where the symbol under the cursor is defined. Servers answer with one of three shapes. */
export function definitionList(r: LspLocation | LspLocation[] | LspLink[] | null): Location[] {
  if (!r) return []
  return (Array.isArray(r) ? r : [r]).map((l) => {
    const link = l as LspLink
    const uri = 'targetUri' in l ? link.targetUri : (l as LspLocation).uri
    const start =
      'targetUri' in l ? link.targetSelectionRange.start : (l as LspLocation).range.start
    return {
      path: decodeURIComponent(new URL(uri).pathname),
      line: start.line,
      ch: start.character
    }
  })
}
