import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forgetDiagnostics,
  lspExtensions,
  registerView,
  unregisterView,
  subscribeProblems
} from './lspExtensions'
import CodeMirror, { Extension } from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { search } from '@codemirror/search'
import {
  LuX,
  LuFileCode,
  LuFileDiff,
  LuEraser,
  LuTriangleAlert,
  LuGitCommitHorizontal
} from 'react-icons/lu'
import { diffOverlay } from './diffOverlay'
import { EmptyState } from './ui'
import { DiffView } from './Markdown'
import { fmtTime } from './util'
import { isDark } from './theme'
import { move } from './dnd'
import { sortableProps } from './sortable'
import type { CommitDetail } from '../../../preload/index.d'
import { LuCode } from 'react-icons/lu'
import { languageName, type EditorStatus } from './commands'

/** A tab: a real file, or a commit opened from the history (`path` is then `commit:<hash>`). */
export type OpenFile = {
  path: string
  content: string
  saved: string
  diff?: string
  commit?: CommitDetail
}

type Props = {
  files: OpenFile[]
  setFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>
  active: string | null
  setActive: (p: string | null) => void
  problems: number
  problemsOpen: boolean
  onToggleProblems: () => void
  onStatus: (status: EditorStatus) => void
  /** Open one file of a commit with its diff highlighted. */
  onOpenFile: (relPath: string, fileDiff: string) => void
}

/** A commit as a full-width page: message, branches, and every change in green and red. */
function CommitPage({
  commit,
  onOpenFile
}: {
  commit: CommitDetail
  onOpenFile: (p: string, d: string) => void
}): React.JSX.Element {
  return (
    <div className="commit-page">
      <h2>{commit.subject}</h2>
      {commit.body && <pre className="gmessage">{commit.body}</pre>}
      <div className="row wrap tight">
        <span className="dim small mono">{commit.hash}</span>
        <span className="dim small">
          {commit.author} {commit.email && `<${commit.email}>`} · {fmtTime(commit.when)}
        </span>
        {commit.branches.map((b) => (
          <span key={b} className={'chip ref' + (b.includes('/') ? ' remote' : '')}>
            {b}
          </span>
        ))}
      </div>
      {commit.diff ? (
        <DiffView diff={commit.diff} onOpen={onOpenFile} />
      ) : (
        <div className="dim small">No file changes in this commit.</div>
      )}
    </div>
  )
}

function lang(path: string): Extension[] {
  const ext = path.split('.').pop() ?? ''
  if (/^(js|jsx|mjs|cjs)$/.test(ext)) return [javascript({ jsx: true })]
  if (/^(ts|tsx|mts)$/.test(ext)) return [javascript({ jsx: true, typescript: true })]
  if (ext === 'json') return [json()]
  if (/^(md|markdown)$/.test(ext)) return [markdown()]
  if (ext === 'css') return [css()]
  if (/^(html|htm)$/.test(ext)) return [html()]
  return []
}

export default function Editor({
  files,
  setFiles,
  active,
  setActive,
  problems: problemTotal,
  problemsOpen,
  onToggleProblems,
  onStatus,
  onOpenFile
}: Props): React.JSX.Element {
  const file = files.find((f) => f.path === active)
  const opened = useRef<Set<string>>(new Set())
  const [problems, setProblems] = useState<Record<string, number>>({})
  const activePath = file?.path
  const activeDiff = file?.diff
  useEffect(
    () => () => {
      if (activePath) unregisterView(activePath)
    },
    [activePath]
  )
  const isCommit = !!file?.commit
  const extensions = useMemo(
    () =>
      activePath
        ? [
            ...lang(activePath),
            search(),
            lspExtensions(activePath),
            ...(activeDiff ? [diffOverlay(activeDiff)] : [])
          ]
        : [],
    [activePath, activeDiff]
  )

  // tell the language servers which files are open
  useEffect(() => {
    for (const f of files)
      if (!f.commit && !opened.current.has(f.path)) {
        opened.current.add(f.path)
        window.luna.lsp.open(f.path, f.content)
      }
    for (const p of [...opened.current])
      if (!files.some((f) => f.path === p)) {
        opened.current.delete(p)
        unregisterView(p)
        forgetDiagnostics(p)
        window.luna.lsp.close(p)
      }
  }, [files])

  useEffect(
    () =>
      subscribeProblems((snapshot) => {
        setProblems(
          Object.fromEntries(
            [...snapshot].map(([path, sources]) => [path, [...sources.values()].flat().length])
          )
        )
      }),
    []
  )

  const close = (path: string): void => {
    const rest = files.filter((f) => f.path !== path)
    setFiles(rest)
    if (active === path) setActive(rest.at(-1)?.path ?? null)
  }

  return (
    <>
      <div className="tabs">
        {files.map((f, i) => (
          <div
            key={f.path}
            className={'tab' + (f.path === active ? ' active' : '')}
            {...sortableProps(i, (from, to) => setFiles((fs) => move(fs, from, to)))}
            onClick={() => setActive(f.path)}
          >
            {f.commit ? (
              <LuGitCommitHorizontal />
            ) : f.content !== f.saved ? (
              <span className="dot" />
            ) : f.diff ? (
              <LuFileDiff />
            ) : (
              <LuFileCode />
            )}
            {f.commit ? f.commit.short : f.path.split('/').pop()}
            {problems[f.path] ? <span className="problems">{problems[f.path]}</span> : null}
            <span
              className="x"
              onClick={(e) => {
                e.stopPropagation()
                close(f.path)
              }}
            >
              <LuX />
            </span>
          </div>
        ))}
        <span className="spacer" />
        <button
          className={'small problems-toggle' + (problemsOpen ? ' active' : '')}
          title={problemsOpen ? 'Hide problems panel' : 'Show problems panel'}
          aria-pressed={problemsOpen}
          onClick={onToggleProblems}
        >
          <LuTriangleAlert /> Problems
          {problemTotal > 0 && <span className="problems">{problemTotal}</span>}
        </button>
        {file?.diff && !isCommit && (
          <>
            <button
              className="small"
              title="Clear diff highlights"
              onClick={() =>
                setFiles((fs) =>
                  fs.map((f) => (f.path === file.path ? { ...f, diff: undefined } : f))
                )
              }
            >
              <LuEraser /> Clear diff
            </button>
          </>
        )}
      </div>
      <div className="fill">
        {file?.commit ? (
          <CommitPage commit={file.commit} onOpenFile={onOpenFile} />
        ) : file ? (
          <CodeMirror
            key={file.path + (file.diff ? ':diff' : '')}
            value={file.content}
            theme={isDark() ? 'dark' : 'light'}
            height="100%"
            extensions={extensions}
            onCreateEditor={(view) => {
              registerView(file.path, view)
              const line = view.state.doc.lineAt(view.state.selection.main.head)
              onStatus({
                path: file.path,
                line: line.number,
                column: view.state.selection.main.head - line.from + 1,
                language: languageName(file.path)
              })
            }}
            onUpdate={(update) => {
              if (update.selectionSet || update.docChanged) {
                const line = update.state.doc.lineAt(update.state.selection.main.head)
                onStatus({
                  path: file.path,
                  line: line.number,
                  column: update.state.selection.main.head - line.from + 1,
                  language: languageName(file.path)
                })
              }
            }}
            onChange={(v) =>
              setFiles((fs) => fs.map((f) => (f.path === file.path ? { ...f, content: v } : f)))
            }
          />
        ) : (
          <EmptyState
            icon={<LuCode />}
            title="No file open"
            text="Pick a file from the Files view, or click a file in a summary to see its diff here."
          >
            <span className="kbd-hint">
              <kbd>⌘S</kbd> save
            </span>
            <span className="kbd-hint">
              <kbd>⌘B</kbd> sidebar
            </span>
            <span className="kbd-hint">
              <kbd>⌘J</kbd> terminals only
            </span>
          </EmptyState>
        )}
      </div>
    </>
  )
}
