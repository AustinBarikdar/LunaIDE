import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { getSettings } from './settings'
import { sh, q } from './shell'
import { hubStatus } from './hub'
import * as vault from './vault'

export async function rollup(project: string): Promise<{ file: string; text: string }> {
  const s = getSettings()
  const items = vault.summariesSinceLastRollup(project)
  if (!items.length) throw new Error('No new summaries since the last roll-up')

  const prompt =
    `You are the coordinator for the software project "${basename(project)}". Below are status summaries posted by AI coding agents (each tagged with the agent name and time). ` +
    `Write a concise roll-up in markdown with sections: What was done; Open problems / risks; Conflicts or duplicated work between agents; Suggested next step per agent. Under 400 words.\n\n` +
    items
      .map((x) => `### [${x.agent}] ${x.title} (${x.time})\n${vault.withoutDiff(x.body)}`)
      .join('\n\n---\n\n')

  const model = s.summarizerModel.trim()
  const cwd = vault.vaultRoot(project) // ponytail: outside the repo so no .mcp.json / project config is picked up
  let r: { code: number; out: string }
  if (s.summarizer === 'claude') {
    // ponytail: --bare would skip MCP too, but it also skips credentials; an empty strict MCP config + cwd outside the repo is the loop guard
    r = await sh(
      `claude -p --strict-mcp-config --mcp-config '{"mcpServers":{}}' ${model ? `--model ${q(model)} ` : ''}--output-format text --tools "" --permission-mode dontAsk`,
      { input: prompt, cwd }
    )
  } else {
    const out = join(tmpdir(), `luna-rollup-${Date.now()}.md`)
    r = await sh(
      `codex exec -s read-only -c 'approval_policy="never"' --ephemeral --skip-git-repo-check --ignore-user-config -C ${q(cwd)} ${model ? `-m ${q(model)} ` : ''}-o ${q(out)} -`,
      { input: prompt, cwd }
    )
    if (r.code === 0) r.out = readFileSync(out, 'utf8')
  }
  if (r.code !== 0) throw new Error(`${s.summarizer} exited ${r.code}:\n${r.out.slice(-2000)}`)

  const text = r.out.trim()
  const file = vault.writeRollup(
    project,
    `---\ntime: ${new Date().toISOString()}\nsummarizer: ${s.summarizer}${model ? ' ' + model : ''}\nsummaries: ${items.length}\n---\n\n${text}\n`
  )
  for (const agent of Object.keys(hubStatus().agents))
    vault.sendMessage(
      project,
      'luna',
      agent,
      `A new roll-up of all agents' work was written:\n\n${text}`
    )
  return { file, text }
}
