import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPathLinks, resolveLink } from './termLinks.ts'

test('findPathLinks picks paths with line and column in both spellings', () => {
  const links = findPathLinks('error in src/main/git.ts:12:5 and ./a.tsx(3,4), see /tmp/x.log ok')
  assert.deepEqual(
    links.map((l) => [l.path, l.line, l.col]),
    [
      ['src/main/git.ts', 12, 5],
      ['./a.tsx', 3, 4],
      ['/tmp/x.log', 0, 0]
    ]
  )
  assert.equal(
    'error in src/main/git.ts:12:5'.slice(links[0].start, links[0].end),
    'src/main/git.ts:12:5'
  )
})
test('findPathLinks leaves prose, urls and emails alone', () => {
  assert.deepEqual(findPathLinks('done. e.g. nothing here, see https://x.com/a.ts or me@x.io'), [])
})
test('resolveLink handles absolute, home and relative paths', () => {
  assert.equal(resolveLink('/a/b.ts', '/p', '/h'), '/a/b.ts')
  assert.equal(resolveLink('~/b.ts', '/p', '/h'), '/h/b.ts')
  assert.equal(resolveLink('src/b.ts', '/p', '/h'), '/p/src/b.ts')
})
