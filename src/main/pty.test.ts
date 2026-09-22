// ponytail: identity collisions are the one piece of pty.ts worth a check. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freeIdentity } from './pty.ts'

test('freeIdentity never hands the same name to two terminals', () => {
  assert.equal(freeIdentity('claude', []), 'claude')
  assert.equal(freeIdentity('claude', ['claude']), 'claude-2')
  assert.equal(freeIdentity('claude', ['claude', 'claude-2']), 'claude-3')
  // the renderer may ask for a numbered name that is already taken
  assert.equal(freeIdentity('claude-2', ['claude', 'claude-2']), 'claude-3')
  // a free numbered name is kept as it is
  assert.equal(freeIdentity('claude-2', ['claude']), 'claude-2')
  assert.equal(freeIdentity('codex', ['claude', 'claude-2']), 'codex')
})
