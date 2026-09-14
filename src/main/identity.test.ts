// ponytail: name matching decides whether a delegated task reaches anyone. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchIdentity, identityFrom } from './identity.ts'

test('matchIdentity forgives how an agent typed the name', () => {
  const known = ['claude', 'claude-2', 'codex']
  assert.equal(matchIdentity('claude', known), 'claude')
  assert.equal(matchIdentity('Claude', known), 'claude')
  assert.equal(matchIdentity('CLAUDE-2', known), 'claude-2')
  assert.equal(matchIdentity('claude 2', known), 'claude-2')
  assert.equal(matchIdentity('claude_2', known), 'claude-2')
  assert.equal(matchIdentity('Codex', known), 'codex')
  // an exact match always wins over a normalised one
  assert.equal(matchIdentity('claude-2', ['claude2', 'claude-2']), 'claude-2')
  // nobody by that name
  assert.equal(matchIdentity('gemini', known), null)
  assert.equal(matchIdentity('', known), null)
  assert.equal(matchIdentity('claude', []), null)
})

test('identityFrom survives a CLI that never expanded the variable', () => {
  assert.equal(identityFrom('claude-2', 'claude'), 'claude-2')
  assert.equal(identityFrom(undefined, 'codex'), 'codex')
  assert.equal(identityFrom('', 'codex-2'), 'codex-2')
  // the template arrives verbatim: use the default it carries, not the template
  assert.equal(identityFrom('${LUNA_AGENT:-claude}', 'claude'), 'claude')
  assert.equal(identityFrom('$LUNA_AGENT', 'codex'), 'codex')
  assert.equal(identityFrom('${LUNA_AGENT}', '${LUNA_AGENT:-codex}'), 'codex')
  assert.equal(identityFrom('${LUNA_AGENT}', '${LUNA_AGENT}'), 'unknown')
})
