import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hoverText, definitionList } from './lspText.ts'

test('hoverText flattens the three shapes a server may answer with', () => {
  assert.equal(hoverText('plain'), 'plain')
  assert.equal(
    hoverText({ kind: 'markdown', value: '```ts\nconst a: number\n```' }),
    'const a: number'
  )
  assert.equal(hoverText([{ language: 'ts', value: 'let x' }, 'docs here']), 'let x\n\ndocs here')
  assert.equal(hoverText(null), '')
})

test('definitionList reads Location, Location[] and LocationLink[]', () => {
  const range = { start: { line: 3, character: 4 } }
  const loc = { uri: 'file:///p/a%20b.ts', range }
  assert.deepEqual(definitionList(loc), [{ path: '/p/a b.ts', line: 3, ch: 4 }])
  assert.deepEqual(definitionList([loc]).length, 1)
  assert.deepEqual(definitionList([{ targetUri: 'file:///p/c.ts', targetSelectionRange: range }]), [
    { path: '/p/c.ts', line: 3, ch: 4 }
  ])
  assert.deepEqual(definitionList(null), [])
})
