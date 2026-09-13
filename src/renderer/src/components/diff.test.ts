// ponytail: the one parser in the renderer. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDiff, splitByFile, diffLineMap } from './diff.ts'

test('parseDiff', () => {
  const kinds = parseDiff(
    'diff --git a/x.ts b/x.ts\nindex 1..2\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1,2 @@\n old\n+new\n-gone'
  ).map((l) => l.kind)
  assert.deepEqual(kinds, ['file', 'meta', 'meta', 'meta', 'hunk', 'ctx', 'add', 'del'])
  assert.equal(parseDiff('diff --git a/src/a.ts b/src/a.ts')[0].text, 'src/a.ts')
})

test('splitByFile + diffLineMap', () => {
  const d =
    'diff --git a/a.ts b/a.ts\n@@ -1,3 +1,3 @@\n keep\n-old\n+new\n keep2\ndiff --git a/b.ts b/b.ts\n@@ -0,0 +1,2 @@\n+x\n+y'
  const files = splitByFile(d)
  assert.deepEqual(
    files.map((f) => f.path),
    ['a.ts', 'b.ts']
  )
  assert.deepEqual(diffLineMap(files[0].diff), { added: [2], deleted: [{ line: 2, text: 'old' }] })
  assert.deepEqual(diffLineMap(files[1].diff), { added: [1, 2], deleted: [] })
})
