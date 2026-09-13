import type { Server } from 'http'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import * as vault from './vault'
import { diffFor } from './git'

export type HubStatus = {
  live: string[]
  running: boolean
  port: number
  project: string
  agents: Record<string, number>
}

let server: Server | undefined
let port = 0
let project = ''
const agents: Record<string, number> = {}
let onChange: (s: HubStatus) => void = () => {}
let onInbox: (agent: string) => void = () => {}
let liveAgents: () => string[] = () => []
/** Called whenever something lands in an agent's inbox (so Luna can nudge its terminal). */
export function setInboxHooks(cb: (agent: string) => void, live: () => string[]): void {
  onInbox = cb
  liveAgents = live
}
export const knownAgents = (): string[] => [...new Set([...Object.keys(agents), ...liveAgents()])]

export const hubStatus = (): HubStatus => ({
  running: !!server,
  port,
  project,
  agents,
  live: liveAgents()
})
export function setProject(p: string): void {
  project = p
  onChange(hubStatus())
}

const text = (t: string): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: t }]
})

function makeServer(agent: string): McpServer {
  const s = new McpServer({ name: 'luna', version: '0.1.0' })
  const p = (): string => {
    if (!project) throw new Error('Luna has no project open')
    return project
  }
  s.registerTool(
    'post_summary',
    {
      description:
        'Post a short summary of what you just did or learned. Luna saves it to the shared vault, captures the git diff of the files you list, and shows both (diff highlighted) in the Summaries tab. Call this after each meaningful change.',
      inputSchema: {
        title: z.string().describe('One-line title'),
        text: z.string().describe('Markdown body: what changed and why'),
        files: z
          .array(z.string())
          .optional()
          .describe(
            'Paths (relative to the project) you changed; Luna diffs them vs HEAD. Omit to diff the whole working tree.'
          ),
        diff: z
          .string()
          .optional()
          .describe('Optional unified diff to show instead of the auto-captured one')
      }
    },
    async ({ title, text: body, files, diff }) => {
      const d = diff ?? (await diffFor(p(), files ?? []))
      const file = vault.postSummary(p(), agent, title, body, d)
      vault.appendEvent(p(), { kind: 'summary', from: agent, title, text: body.slice(0, 600) })
      return text(`Saved: ${file}`)
    }
  )
  s.registerTool(
    'read_summaries',
    {
      description: 'Read the most recent summaries posted by all agents (including you).',
      inputSchema: { limit: z.number().int().min(1).max(100).optional() }
    },
    async ({ limit }) =>
      text(
        vault
          .readSummaries(p(), limit ?? 20)
          .map((x) => `### [${x.agent}] ${x.title} (${x.time})\n${vault.withoutDiff(x.body)}`)
          .join('\n\n---\n\n') || '(no summaries yet)'
      )
  )
  s.registerTool(
    'send_message',
    {
      description:
        'Leave a message in another agent\'s inbox (e.g. "claude", "codex"). They see it next time they call read_inbox.',
      inputSchema: { to: z.string(), text: z.string() }
    },
    async ({ to, text: body }) => {
      vault.sendMessage(p(), agent, to, body)
      vault.appendEvent(p(), {
        kind: 'message',
        from: agent,
        to: vault.safe(to),
        text: body.slice(0, 600)
      })
      onInbox(vault.safe(to))
      return text(`Delivered to ${to}'s inbox`)
    }
  )
  s.registerTool(
    'delegate',
    {
      description:
        "Team-leader tool: hand out self-contained tasks to other agents. Each task lands in that agent's inbox and Luna prompts their terminal to start. Include everything they need (files, acceptance criteria); they cannot see your context.",
      inputSchema: {
        assignments: z
          .array(
            z.object({
              to: z.string().describe('agent name, e.g. "codex"'),
              task: z.string().describe('full task text')
            })
          )
          .min(1)
      }
    },
    async ({ assignments }) => {
      const lines = assignments.map(({ to, task }) => {
        vault.sendMessage(
          p(),
          agent,
          to,
          `**TASK from ${agent}** — when done, call post_summary and send_message back to "${agent}".\n\n${task}`
        )
        vault.appendEvent(p(), {
          kind: 'task',
          from: agent,
          to: vault.safe(to),
          text: task.slice(0, 600)
        })
        const live = liveAgents().includes(vault.safe(to))
        onInbox(vault.safe(to))
        return `${to}: queued${live ? ' and their terminal was prompted' : ' (no Luna terminal open for them; they will see it on read_inbox)'}`
      })
      return text(lines.join('\n'))
    }
  )
  s.registerTool(
    'list_agents',
    {
      description: 'Names of agents Luna knows about (with a live terminal or seen on the hub).',
      inputSchema: {}
    },
    async () =>
      text(
        knownAgents()
          .map((a) => `${a}${liveAgents().includes(a) ? ' (terminal open)' : ''}`)
          .join('\n') || '(none yet)'
      )
  )
  s.registerTool(
    'read_inbox',
    {
      description: 'Read and clear your inbox of messages from other agents and Luna.',
      inputSchema: {}
    },
    async () => text(vault.readInbox(p(), agent) || '(inbox empty)')
  )
  s.registerTool(
    'memory_write',
    {
      description:
        'Save a markdown note to memory. scope "project" (default) is this project only; scope "shared" is the universal vault every project and agent can pull from — use it for conventions, decisions, and lessons that outlive this repo. Overwrites a note of the same name.',
      inputSchema: {
        name: z.string(),
        content: z.string(),
        scope: z.enum(['project', 'shared']).optional()
      }
    },
    async ({ name, content, scope }) => {
      vault.memoryWrite(p(), name, content, scope ?? 'project')
      vault.appendEvent(p(), {
        kind: 'memory',
        from: agent,
        title: vault.safe(name),
        text: content.slice(0, 300)
      })
      return text(`Saved ${scope ?? 'project'} memory/${vault.safe(name)}.md`)
    }
  )
  s.registerTool(
    'memory_read',
    {
      description: 'Read a named note from memory (project note first, then the shared vault).',
      inputSchema: { name: z.string() }
    },
    async ({ name }) => text(vault.memoryRead(p(), name) ?? `(no memory named ${name})`)
  )
  s.registerTool(
    'memory_list',
    {
      description: "List memory notes: this project's and the shared universal vault.",
      inputSchema: {}
    },
    async () =>
      text(
        vault
          .memoryList(p())
          .map((m) => `${m.name}  [${m.scope}]`)
          .join('\n') || '(memory empty)'
      )
  )
  s.registerTool(
    'memory_search',
    {
      description:
        'Search project memory, the shared universal vault, and past summaries for a topic. Call this before starting work to pull in what other agents and projects already learned.',
      inputSchema: { query: z.string().describe('keywords, e.g. "auth token refresh"') }
    },
    async ({ query }) =>
      text(
        vault
          .memorySearch(p(), query)
          .map((h) => `### ${h.where}\n${h.snippet}`)
          .join('\n\n---\n\n') || '(nothing found)'
      )
  )
  return s
}

export async function startHub(newPort: number, notify: (s: HubStatus) => void): Promise<void> {
  await stopHub()
  onChange = notify
  port = newPort
  const app = createMcpExpressApp({ host: '127.0.0.1' })

  // ponytail: stateless — fresh server+transport per request; identity = URL path
  app.post('/mcp/:agent', async (req, res) => {
    // per-terminal identity comes in a header (set from LUNA_AGENT); the path is the fallback
    const agent = vault.safe(String(req.get('x-luna-agent') || req.params.agent))
    agents[agent] = Date.now()
    onChange(hubStatus())
    const s = makeServer(agent)
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      t.close()
      s.close()
    })
    await s.connect(t)
    await t.handleRequest(req, res, req.body)
  })
  app.all('/mcp/:agent', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Stateless server: POST only' },
      id: null
    })
  })
  // used by the Claude Code UserPromptSubmit hook to nudge the agent
  app.get('/inbox/:agent/peek', (req, res) => {
    const n = project ? vault.inboxCount(project, req.params.agent) : 0
    res
      .type('text/plain')
      .send(
        n
          ? `Luna: you have ${n} unread message(s) from other agents. Call the luna read_inbox tool.`
          : ''
      )
  })

  await new Promise<void>((resolve, reject) => {
    server = app.listen(port, '127.0.0.1', () => resolve()).on('error', reject)
  })
  onChange(hubStatus())
}

export async function stopHub(): Promise<void> {
  const s = server
  server = undefined
  if (s) await new Promise<void>((r) => s.close(() => r()))
}
