// ponytail: registration rules that decide whether Luna prompts "Register" or "Update". Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claudeStatus, codexStatus } from './agents-status.ts'

test('claude: missing → not registered; old → outdated; header → registered', () => {
  assert.deepEqual(claudeStatus({}), { registered: false })
  assert.deepEqual(claudeStatus({ mcpServers: { luna: { url: 'x' } } }), {
    registered: false,
    outdated: true
  })
  assert.deepEqual(
    claudeStatus({
      mcpServers: { luna: { url: 'x', headers: { 'X-Luna-Agent': '${LUNA_AGENT:-claude}' } } }
    }),
    { registered: true }
  )
})
test('codex: needs both the server and the env header line', () => {
  const line = 'env_http_headers = { "X-Luna-Agent" = "LUNA_AGENT" }'
  assert.deepEqual(codexStatus(false, '', line), { registered: false })
  assert.deepEqual(codexStatus(true, '[mcp_servers.luna]\nurl = "x"\n', line), {
    registered: false,
    outdated: true
  })
  assert.deepEqual(codexStatus(true, `[mcp_servers.luna]\nurl = "x"\n${line}\n`, line), {
    registered: true
  })
})
