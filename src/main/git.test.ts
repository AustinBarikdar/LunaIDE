// ponytail: the one non-trivial parser in git.ts. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStatus } from './git.ts'

test('parseStatus', () => {
  assert.deepEqual(parseStatus('## main...origin/main [ahead 1]\n M src/a.ts\n?? new.txt'), {
    branch: 'main',
    upstream: 'origin/main',
    changes: [
      { code: 'M', path: 'src/a.ts' },
      { code: '??', path: 'new.txt' }
    ]
  })
  assert.deepEqual(parseStatus('## No commits yet on main'), {
    branch: 'main',
    upstream: '',
    changes: []
  })
})
