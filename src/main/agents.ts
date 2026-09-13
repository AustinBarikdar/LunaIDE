import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { sh } from './shell'
import { claudeStatus, codexStatus, type AgentStatus } from './agents-status'

export type AgentName = 'claude' | 'codex'
/** Codex sends the LUNA_AGENT env var as a header so each terminal has its own hub identity. */
const CODEX_HEADER_LINE = 'env_http_headers = { "X-Luna-Agent" = "LUNA_AGENT" }'
const codexConfig = (): string => join(process.env.HOME ?? '', '.codex', 'config.toml')
export type Preview = { title: string; body: string }[]

const url = (port: number, agent: AgentName): string => `http://127.0.0.1:${port}/mcp/${agent}`
const readJson = (f: string): Record<string, unknown> =>
  existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}

function claudeFiles(
  project: string,
  port: number
): { path: string; content: Record<string, unknown> }[] {
  const mcp = join(project, '.mcp.json')
  const mcpJson = readJson(mcp) as { mcpServers?: Record<string, unknown> }
  // ${LUNA_AGENT:-claude} is expanded by Claude Code, so each Luna terminal reports its own identity
  mcpJson.mcpServers = {
    ...mcpJson.mcpServers,
    luna: {
      type: 'http',
      url: url(port, 'claude'),
      headers: { 'X-Luna-Agent': '${LUNA_AGENT:-claude}' }
    }
  }

  const settings = join(project, '.claude', 'settings.local.json')
  const cmd = `curl -s --max-time 2 "http://127.0.0.1:${port}/inbox/${'${LUNA_AGENT:-claude}'}/peek" || true` // never block or error a prompt when Luna is closed
  const s = readJson(settings) as {
    hooks?: Record<string, { hooks: { type: string; command: string }[] }[]>
  }
  const list = ((s.hooks ??= {}).UserPromptSubmit ?? []).filter(
    (h) => !h.hooks?.some((x) => x.command !== cmd && /inbox\/[^/]+\/peek/.test(x.command))
  )
  if (!list.some((h) => h.hooks?.some((x) => x.command === cmd)))
    list.push({ hooks: [{ type: 'command', command: cmd }] })
  s.hooks.UserPromptSubmit = list
  return [
    { path: mcp, content: mcpJson },
    { path: settings, content: s }
  ]
}

export function preview(agent: AgentName, project: string, port: number): Preview {
  if (agent === 'claude')
    return claudeFiles(project, port).map((f) => ({
      title: `write ${f.path}`,
      body: JSON.stringify(f.content, null, 2)
    }))
  return [
    { title: 'run', body: `codex mcp add luna --url ${url(port, 'codex')}` },
    { title: 'add to ~/.codex/config.toml under [mcp_servers.luna]', body: CODEX_HEADER_LINE }
  ]
}

export async function register(agent: AgentName, project: string, port: number): Promise<string> {
  if (agent === 'claude') {
    for (const f of claudeFiles(project, port)) {
      mkdirSync(dirname(f.path), { recursive: true })
      writeFileSync(f.path, JSON.stringify(f.content, null, 2) + '\n')
    }
    return 'Wrote .mcp.json and .claude/settings.local.json. Start claude in this project and approve the "luna" server when prompted (once).'
  }
  const r = await sh(`codex mcp add luna --url ${url(port, 'codex')}`)
  if (r.code !== 0) return `codex mcp add failed (${r.code}):\n${r.out}`
  // codex mcp add has no flag for env headers: patch the section it just wrote
  const f = codexConfig()
  if (existsSync(f)) {
    const toml = readFileSync(f, 'utf8')
    if (!toml.includes(CODEX_HEADER_LINE))
      writeFileSync(
        f,
        toml.replace(/^\[mcp_servers\.luna\]\s*$/m, (m) => `${m}\n${CODEX_HEADER_LINE}`)
      )
  }
  return 'Registered in ~/.codex/config.toml. Restart codex; it will connect to luna.'
}

export type { AgentStatus }

/** Is the hub registered with this CLI, including the per-terminal identity wiring? */
export async function status(agent: AgentName, project: string): Promise<AgentStatus> {
  if (agent === 'claude') return claudeStatus(project ? readJson(join(project, '.mcp.json')) : {})
  const registered = (await sh('codex mcp get luna')).code === 0
  const f = codexConfig()
  return codexStatus(registered, existsSync(f) ? readFileSync(f, 'utf8') : '', CODEX_HEADER_LINE)
}
