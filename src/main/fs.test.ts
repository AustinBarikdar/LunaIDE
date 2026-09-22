import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uniqueName } from './fs.ts'

test('uniqueName numbers a taken name and keeps the extension', () => {
  const taken = new Set(['a.ts', 'a 2.ts', 'Makefile', '.env'])
  const has = (n: string): boolean => taken.has(n)
  assert.equal(uniqueName('b.ts', has), 'b.ts')
  assert.equal(uniqueName('a.ts', has), 'a 3.ts')
  assert.equal(uniqueName('Makefile', has), 'Makefile 2')
  assert.equal(uniqueName('.env', has), '.env 2')
})
