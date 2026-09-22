// ponytail: the one non-trivial parser in git.ts. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStatus, parseLog } from './git.ts'

test('parseStatus', () => {
  assert.deepEqual(parseStatus('## main...origin/main [ahead 1]\n M src/a.ts\n?? new.txt'), {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 1,
    behind: 0,
    changes: [
      { code: 'M', path: 'src/a.ts' },
      { code: '??', path: 'new.txt' }
    ]
  })
  assert.deepEqual(parseStatus('## No commits yet on main'), {
    branch: 'main',
    upstream: '',
    ahead: 0,
    behind: 0,
    changes: []
  })
  const both = parseStatus('## dev...origin/dev [ahead 2, behind 3]')
  assert.equal(both.upstream, 'origin/dev')
  assert.equal(both.ahead, 2)
  assert.equal(both.behind, 3)
  // a single dot belongs to the branch name; only ".." (illegal in refs) marks the separator
  const dotted = parseStatus('## release/1.0...origin/release/1.0 [ahead 1]')
  assert.equal(dotted.branch, 'release/1.0')
  assert.equal(dotted.upstream, 'origin/release/1.0')
})

test('parseLog marks commits that only exist locally', () => {
  const line = (h: string, parents: string, refs = ''): string =>
    [h, h.slice(0, 7), 'Ada', '2026-09-13T10:00:00+00:00', 'subject ' + h, parents, refs].join(
      '\x1f'
    )
  const out = [
    line('aaa1111', '', 'HEAD -> main'),
    line('bbb2222', 'ccc3333 ddd4444', 'origin/main, tag: v1'),
    line('ccc3333', 'eee5555')
  ].join('\n')
  const commits = parseLog(out, new Set(['aaa1111']))
  assert.deepEqual(
    commits.map((c) => [c.short, c.local, c.parents.length, c.refs]),
    [
      ['aaa1111', true, 0, ['main']],
      ['bbb2222', false, 2, ['origin/main', 'tag: v1']],
      ['ccc3333', false, 1, []]
    ]
  )
  // no upstream at all: nothing has been pushed anywhere
  assert.ok(parseLog(out, null).every((c) => c.local))
})
