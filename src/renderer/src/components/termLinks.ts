// File paths in terminal output (agents print them constantly) become links to the editor.
// ponytail: a regex over the visible line text; needs a dot-extension so prose never lights up.

export type PathLink = {
  /** Character range in the line, start inclusive and end exclusive. */
  start: number
  end: number
  path: string
  /** 1-based, as printed; 0 when the line said nothing. */
  line: number
  col: number
}

// must start the line or follow whitespace / an opening quote or bracket, so the tail of a URL
// or an email never counts; @ only opens a segment (scoped packages), so me@x.io is not one;
// the extension starts with a letter so "v1.20" is not a file
const PATH =
  /(?<=^|[\s([<'"`])(?:~\/|\.{1,2}\/|\/)?@?[\w-][\w.-]*(?:\/@?[\w.-]+)*\.[A-Za-z][A-Za-z0-9]{0,7}(?::(\d+)(?::(\d+))?|\((\d+),(\d+)\))?/g

export function findPathLinks(text: string): PathLink[] {
  const out: PathLink[] = []
  for (const m of text.matchAll(PATH)) {
    const whole = m[0]
    const pathEnd = whole.search(/(?::\d+(?::\d+)?|\(\d+,\d+\))$/)
    const path = pathEnd === -1 ? whole : whole.slice(0, pathEnd)
    // ponytail: "e.g." and "i.e." read as files; a bare name needs a two-letter extension
    // (so main.c on its own is missed, src/main.c is not) — the exists check catches the rest
    if (!path.includes('/') && /\.[A-Za-z]$/.test(path)) continue
    out.push({
      start: m.index,
      end: m.index + whole.length,
      path,
      line: Number(m[1] ?? m[3] ?? 0),
      col: Number(m[2] ?? m[4] ?? 0)
    })
  }
  return out
}

/** Absolute path for a link printed in a terminal whose shell sits in `cwd`. */
export const resolveLink = (path: string, cwd: string, home: string): string =>
  path.startsWith('/') ? path : path.startsWith('~/') ? home + path.slice(1) : `${cwd}/${path}`
