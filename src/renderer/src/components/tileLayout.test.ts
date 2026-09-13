import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnsFor, rowsFor } from './tileLayout.ts'

const terms = (n: number): { id: string }[] =>
  Array.from({ length: n }, (_, i) => ({ id: 'a' + i }))
const shape = (n: number, mode: 'grid' | 'cols' | 'rows'): number[] =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rowsFor(terms(n) as any, mode).map((r) => r.length)

test('grid puts 3+ terminals into corners', () => {
  assert.deepEqual(shape(1, 'grid'), [1])
  assert.deepEqual(shape(2, 'grid'), [2])
  assert.deepEqual(shape(3, 'grid'), [2, 1])
  assert.deepEqual(shape(4, 'grid'), [2, 2])
  assert.deepEqual(shape(6, 'grid'), [3, 3])
  assert.deepEqual(shape(9, 'grid'), [3, 3, 3])
})

test('cols and rows force one line', () => {
  assert.deepEqual(shape(4, 'cols'), [4])
  assert.deepEqual(shape(3, 'rows'), [1, 1, 1])
  assert.deepEqual(shape(0, 'grid'), [])
  assert.equal(columnsFor(0, 'cols'), 1)
})
