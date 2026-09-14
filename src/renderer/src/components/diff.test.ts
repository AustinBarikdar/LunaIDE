// ponytail: anchor placement decides whether a note lands on the right line. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeNotes } from './diff.ts'

const doc = [
  'const a = 1',
  'function greet(name) {',
  '  return `hi ${name}`',
  '}',
  'greet("x")'
].join('\n')
const map = { added: [2, 3, 4], deleted: [{ line: 5, text: 'sayHi("x")' }] }

test('placeNotes pins notes to added lines, removed lines, and keeps step numbers', () => {
  const placed = placeNotes(
    doc,
    map,
    [
      { file: 'src/app.ts', anchor: 'function greet(name)', why: 'the new greeting' },
      { file: 'other.ts', anchor: 'nothing here', why: 'belongs to another file' },
      { file: 'src/app.ts', anchor: 'sayHi("x")', why: 'the old call went away', kind: 'removed' },
      { file: 'app.ts', anchor: '  return   `hi ${name}`  ', why: 'whitespace is forgiven' },
      { file: 'src/app.ts', anchor: 'const a = 1', why: 'an unchanged line still gets a bubble' }
    ],
    '/Users/me/proj/src/app.ts'
  )
  assert.deepEqual(
    placed.map((p) => [p.step, p.line, p.removed]),
    [
      [1, 2, false],
      [3, 5, true],
      [4, 3, false],
      [5, 1, false]
    ]
  )
})

test('placeNotes prefers an added line when the anchor appears twice', () => {
  const twice = ['greet()', 'greet()'].join('\n')
  const placed = placeNotes(
    twice,
    { added: [2], deleted: [] },
    [{ file: 'a', anchor: 'greet()', why: '' }],
    'a'
  )
  assert.equal(placed[0].line, 2)
})
