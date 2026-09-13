import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileScore, ProjectSearch, searchProject } from './search.ts'
import type { SearchRequest, SearchResponse } from '../shared/search.ts'

async function fixture(t: {
  after: (fn: () => Promise<void>) => void
}): Promise<{ root: string; put: (name: string, contents: string | Buffer) => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'luna-search-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return {
    root,
    put: async (name, contents) => {
      const path = join(root, name)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, contents)
    }
  }
}
const request = (
  project: string,
  query = '',
  patch: Partial<SearchRequest> = {}
): SearchRequest => ({
  id: crypto.randomUUID(),
  project,
  query,
  openPaths: [],
  buffers: [],
  ...patch
})
const search = (mode: 'files' | 'text', req: SearchRequest): Promise<SearchResponse> =>
  searchProject(mode, req, new AbortController().signal)

test('file ranking uses name/path matches and prioritizes open files for an empty query', async (t) => {
  const { root, put } = await fixture(t)
  await Promise.all(
    ['app.ts', 'app.test.ts', 'src/zapp.ts', 'app/other.ts', 'alpha.ts'].map((name) =>
      put(name, 'hello')
    )
  )
  const result = await search('files', request(root, 'app'))
  assert.deepEqual(
    result.results.map((r) => r.relativePath),
    ['app.test.ts', 'app.ts', 'src/zapp.ts', 'app/other.ts']
  )
  const opened = await search(
    'files',
    request(root, '', { openPaths: [join(root, 'src/zapp.ts')] })
  )
  assert.equal(opened.results[0].relativePath, 'src/zapp.ts')
  assert.equal(fileScore('src/app.ts', 'app.ts'), 0)
  assert.equal(fileScore('src/app.ts', 'sat'), 4)
  assert.equal(fileScore('src/app.ts', 'missing'), Infinity)
})

test('nested gitignore rules, overrides, generated folders, symlinks, and non-text files are excluded', async (t) => {
  const { root, put } = await fixture(t)
  await put('.gitignore', '*.log\n!keep.log\nignored/\nchild/*.txt\n')
  await put('child/.gitignore', '!include.txt\nblocked.md\n')
  await Promise.all(
    [
      'skip.log',
      'keep.log',
      'ignored/a.ts',
      'child/exclude.txt',
      'child/include.txt',
      'child/blocked.md',
      'child/visible.ts',
      'node_modules/a.ts',
      'out/a.ts',
      'dist/a.ts',
      '.git/a.ts'
    ].map((p) => put(p, 'needle'))
  )
  await put('binary.png', Buffer.from([0, 1, 2]))
  await put('invalid.txt', Buffer.from([0xff, 0xfe, 0xff]))
  await put('large.txt', 'x'.repeat(1024 * 1024 + 1))
  await symlink(join(root, 'keep.log'), join(root, 'link.txt'))
  await symlink(join(root, 'child'), join(root, 'linked-directory'))
  const result = await search('text', request(root, 'needle'))
  assert.deepEqual(result.results.map((r) => r.relativePath).sort(), [
    'child/include.txt',
    'child/visible.ts',
    'keep.log'
  ])
  const files = await search('files', request(root))
  assert.ok(!files.results.some((r) => /binary|invalid|large|link/.test(r.relativePath)))
})

test('text search is literal and reports UTF-16 coordinates with case and whole-word options', async (t) => {
  const { root, put } = await fixture(t)
  await put('text.ts', '😀 a.b A.B axb\r\ncat concatenate cat_ écat caté\nCat CAT')
  const literal = await search('text', request(root, 'a.b'))
  assert.deepEqual(
    literal.results.map((r) => [r.line, r.column, r.length]),
    [
      [0, 3, 3],
      [0, 7, 3]
    ]
  )
  assert.equal((await search('text', request(root, 'a.b', { matchCase: true }))).results.length, 1)
  assert.equal((await search('text', request(root, 'cat', { wholeWord: true }))).results.length, 3)
  assert.equal(
    (await search('text', request(root, 'cat', { wholeWord: true, matchCase: true }))).results
      .length,
    1
  )
  assert.equal((await search('text', request(root, ''))).results.length, 0)
})

test('unsaved buffers override disk contents without adding paths outside the project', async (t) => {
  const { root, put } = await fixture(t)
  await put('edited.ts', 'on disk')
  const buffers = [
    { path: join(root, 'edited.ts'), content: 'unsaved needle' },
    { path: join(root, '..', 'outside.ts'), content: 'needle' }
  ]
  assert.equal((await search('text', request(root, 'disk', { buffers }))).results.length, 0)
  const result = await search('text', request(root, 'needle', { buffers }))
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].column, 8)
})

test('result limits are explicit and exact limits are not falsely marked truncated', async (t) => {
  const { root, put } = await fixture(t)
  await Promise.all(Array.from({ length: 101 }, (_, i) => put(`file-${i}.txt`, 'needle')))
  const files = await search('files', request(root))
  assert.equal(files.results.length, 100)
  assert.equal(files.truncated, true)
  await put('matches.txt', 'needle '.repeat(501))
  const matches = await search('text', request(root, 'needle'))
  assert.equal(matches.results.length, 500)
  assert.equal(matches.truncated, true)
  await put('exact.txt', 'unique '.repeat(500))
  const exact = await search('text', request(root, 'unique'))
  assert.equal(exact.results.length, 500)
  assert.equal(exact.truncated, false)
})

test('new queries, cancellation, and project changes discard obsolete work', async (t) => {
  const { root, put } = await fixture(t)
  await put('one.txt', 'needle')
  const other = await fixture(t)
  await other.put('two.txt', 'needle')
  const service = new ProjectSearch()
  service.setProject(root)
  const first = service.run('text', request(root, 'needle'))
  const second = service.run('files', request(root, 'one'))
  assert.equal((await first).cancelled, true)
  assert.equal((await second).results[0].relativePath, 'one.txt')
  const cancelRequest = request(root, 'needle')
  const cancelled = service.run('text', cancelRequest)
  service.cancel(cancelRequest.id)
  assert.equal((await cancelled).cancelled, true)
  const oldProject = service.run('text', request(root, 'needle'))
  service.setProject(other.root)
  assert.equal((await oldProject).cancelled, true)
  assert.equal((await service.run('text', request(root, 'needle'))).cancelled, true)
  assert.equal(
    (await service.run('text', request(other.root, 'needle'))).results[0].relativePath,
    'two.txt'
  )
})
