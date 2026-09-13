// Pure registration-status rules (no imports, so `node --test` can load them).
export type AgentStatus = { registered: boolean; outdated?: boolean }

/** Claude: .mcp.json must have the luna server AND the per-terminal identity header. */
export function claudeStatus(mcpJson: unknown): AgentStatus {
  const luna = (mcpJson as { mcpServers?: Record<string, { headers?: Record<string, string> }> })
    ?.mcpServers?.luna
  if (!luna) return { registered: false }
  return luna.headers?.['X-Luna-Agent']
    ? { registered: true }
    : { registered: false, outdated: true }
}

/** Codex: `codex mcp get luna` must succeed AND config.toml must carry the env header line. */
export function codexStatus(
  registered: boolean,
  configToml: string,
  headerLine: string
): AgentStatus {
  if (!registered) return { registered: false }
  return configToml.includes(headerLine)
    ? { registered: true }
    : { registered: false, outdated: true }
}
