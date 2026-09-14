/**
 * Agents type each other's names by hand, so "Claude", "claude 2" and "CLAUDE-2" all have to
 * land on the identity Luna actually knows. Anything unmatched is the caller's mistake, not a
 * new agent: delivering it anyway would drop the message into an inbox nobody reads.
 */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function matchIdentity(wanted: string, known: string[]): string | null {
  if (!wanted) return null
  const exact = known.find((k) => k === wanted)
  if (exact) return exact
  const w = norm(wanted)
  return w ? (known.find((k) => norm(k) === w) ?? null) : null
}

/**
 * Who a request is from. The CLIs put the identity in the URL path and in an X-Luna-Agent header,
 * both written as `${LUNA_AGENT:-claude}` for the shell to expand. A CLI that does not expand it
 * sends the template through verbatim; treating that as a name would give the agent an inbox no
 * one else writes to — its own messages would vanish — so fall back to the default inside it.
 */
export function identityFrom(header: string | undefined, path: string): string {
  const clean = (v?: string): string | null => {
    const t = (v ?? '').trim()
    if (!t) return null
    if (!/[${}]/.test(t)) return t
    return t.match(/:-\s*([^}\s]+)/)?.[1] ?? null
  }
  return clean(header) ?? clean(path) ?? 'unknown'
}
