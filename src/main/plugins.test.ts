import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePluginManifest } from '../shared/plugins.ts'

test('validates and normalizes a language plugin', () => {
  const manifest = parsePluginManifest({
    name: 'python-tools',
    languageServers: [{ name: 'Python', command: 'pyright-langserver', exts: ['.PY', ' pyi '] }]
  })
  assert.deepEqual(manifest.languageServers?.[0].exts, ['py', 'pyi'])
})

test('rejects malformed contributions before the runtime consumes them', () => {
  for (const fields of [
    { agents: 'not-an-array' },
    { agents: [{ id: 'helper', name: 'Helper', command: '' }] },
    { languageServers: [{ name: 'Python', command: 'server', exts: 'py' }] },
    { languageServers: [{ name: 'Python', command: 'server', exts: [] }] },
    { languageServers: [{ name: 'Python', command: 'server', exts: ['.'] }] }
  ])
    assert.throws(() => parsePluginManifest({ name: 'test-plugin', ...fields }))
})

test('plugin names cannot escape the installation directory', () => {
  for (const name of ['..', '../outside', '/tmp/plugin', '.', 'a/b', 'a\\b', '']) {
    assert.throws(() => parsePluginManifest({ name }))
  }
})

test('duplicate agent identities are rejected', () => {
  assert.throws(
    () =>
      parsePluginManifest({
        name: 'test-plugin',
        agents: [
          { id: 'helper', name: 'One', command: 'one' },
          { id: 'helper', name: 'Two', command: 'two' }
        ]
      }),
    /Agent IDs must be unique/
  )
})
