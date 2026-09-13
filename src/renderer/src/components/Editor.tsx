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
import { LuX, LuFileCode, LuFileDiff, LuEraser, LuTriangleAlert } from 'react-icons/lu'
import { diffOverlay } from './diffOverlay'
import { EmptyState } from './ui'
import { LuCode } from 'react-icons/lu'
import { languageName, type EditorStatus } from './commands'

export type OpenFile = { path: string; content: string; saved: string; diff?: string }

type Props = {
  files: OpenFile[]
  setFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>
  active: string | null
  setActive: (p: string | null) => void
  problems: number
  problemsOpen: boolean
  onToggleProblems: () => void
  onStatus: (status: EditorStatus) => void
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
  onStatus
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
      if (!opened.current.has(f.path)) {
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
        {files.map((f) => (
          <div
            key={f.path}
            className={'tab' + (f.path === active ? ' active' : '')}
            onClick={() => setActive(f.path)}
          >
            {f.content !== f.saved ? (
              <span className="dot" />
            ) : f.diff ? (
              <LuFileDiff />
            ) : (
              <LuFileCode />
            )}
            {f.path.split('/').pop()}
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
        {file?.diff && (
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
        {file ? (
          <CodeMirror
            key={file.path + (file.diff ? ':diff' : '')}
            value={file.content}
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
