import { useEffect, useMemo, useRef, useState } from 'react'
import { LuSearch, LuFileCode, LuTerminal, LuX } from 'react-icons/lu'
import type { SearchMode, SearchResult, SearchResponse } from '../../../preload/index.d'
import type { OpenFile } from './Editor'
import { filterCommands, modifierLabel, type Command } from './commands'

type Props = {
  mode: SearchMode
  project: string | null
  files: OpenFile[]
  commands: Command[]
  onMode: (mode: SearchMode) => void
  onClose: (restoreFocus?: boolean) => void
  onResult: (result: SearchResult) => void
  onCommand: (command: Command) => void
}

export default function SearchPopup(props: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const request = useMemo(
    () => ({
      id: crypto.randomUUID(),
      project: props.project ?? '',
      query,
      matchCase,
      wholeWord,
      openPaths: props.files.map((file) => file.path),
      buffers: props.files
        .filter((file) => file.content !== file.saved)
        .map(({ path, content }) => ({ path, content }))
    }),
    [props.project, props.files, query, matchCase, wholeWord]
  )
  const [response, setResponse] = useState<
    (SearchResponse & { id: string; error?: string }) | null
  >(null)
  const current = response?.id === request.id ? response : null
  const results = current?.results ?? []
  const truncated = current?.truncated ?? false
  const error = current?.error ?? ''
  const eligible =
    props.mode !== 'commands' && !!props.project && (props.mode === 'files' || !!query)
  const loading = eligible && !current
  const commands = props.mode === 'commands' ? filterCommands(props.commands, query) : []
  const count = props.mode === 'commands' ? commands.length : results.length

  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    if (!eligible || props.mode === 'commands') return
    let valid = true
    const mode = props.mode
    const timer = setTimeout(() => {
      window.luna.search[mode](request)
        .then((result) => {
          if (valid) setResponse({ ...result, id: request.id })
        })
        .catch((err) => {
          if (valid)
            setResponse({
              id: request.id,
              results: [],
              cancelled: false,
              truncated: false,
              error: err instanceof Error ? err.message : String(err)
            })
        })
    }, 150)
    return () => {
      valid = false
      clearTimeout(timer)
      window.luna.search.cancel(request.id)
    }
  }, [request, props.mode, eligible])

  useEffect(() => {
    dialog.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const close = (): void => {
    props.onClose()
  }
  const activate = (index: number): void => {
    if (props.mode === 'commands') {
      const command = commands[index]
      if (command && command.enabled !== false) props.onCommand(command)
    } else if (results[index]) props.onResult(results[index])
  }
  const chooseMode = (mode: SearchMode): void => {
    setQuery('')
    setSelected(0)
    props.onMode(mode)
  }
  return (
    <div
      className="search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="search-popup"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setSelected((index) =>
              count ? (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0
            )
          } else if (event.key === 'Enter' && event.target === input.current) {
            event.preventDefault()
            activate(Math.min(selected, count - 1))
          } else if (event.key === 'Tab') {
            const nodes = [
              ...(dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled):not([tabindex="-1"]), input'
              ) ?? [])
            ]
            const first = nodes[0],
              last = nodes.at(-1)
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <div className="search-modes" aria-label="Search modes">
          {(['files', 'text', 'commands'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={props.mode === mode}
              className={props.mode === mode ? 'on' : ''}
              onClick={() => chooseMode(mode)}
            >
              {mode === 'text' ? 'Project Text' : mode === 'files' ? 'Files' : 'Commands'}
              <span>
                {modifierLabel()}
                {mode === 'files' ? 'P' : mode === 'text' ? '⇧F' : '⇧P'}
              </span>
            </button>
          ))}
          <button className="search-close" aria-label="Close search" onClick={close}>
            <LuX />
          </button>
        </div>
        <div className="search-input-row">
          <LuSearch />
          <input
            ref={input}
            role="combobox"
            aria-label={
              props.mode === 'commands'
                ? 'Find a command'
                : props.mode === 'text'
                  ? 'Search project text'
                  : 'Search files'
            }
            aria-expanded={true}
            aria-controls="quick-search-results"
            aria-activedescendant={
              count ? `quick-result-${Math.min(selected, count - 1)}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            maxLength={1000}
            value={query}
            placeholder={
              props.mode === 'commands'
                ? 'Find a command…'
                : props.mode === 'text'
                  ? 'Find text in your project…'
                  : 'Search files by name or path…'
            }
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
          />
          {props.mode === 'text' && (
            <>
              <button
                aria-label="Match case"
                title="Match case"
                aria-pressed={matchCase}
                onClick={() => {
                  setSelected(0)
                  setMatchCase(!matchCase)
                }}
              >
                Aa
              </button>
              <button
                aria-label="Whole word"
                title="Whole word"
                aria-pressed={wholeWord}
                onClick={() => {
                  setSelected(0)
                  setWholeWord(!wholeWord)
                }}
              >
                Ab
              </button>
            </>
          )}
        </div>
        <div
          className="search-results"
          id="quick-search-results"
          role="listbox"
          aria-label="Search results"
          aria-busy={loading}
        >
          {props.mode === 'commands'
            ? commands.map((command, index) => (
                <button
                  role="option"
                  tabIndex={-1}
                  id={`quick-result-${index}`}
                  aria-selected={selected === index}
                  aria-disabled={command.enabled === false}
                  className="search-result"
                  key={command.id}
                  onClick={() => activate(index)}
                >
                  <LuTerminal />
                  <span>{command.label}</span>
                  <span className="search-result-detail">
                    {command.enabled === false ? 'Unavailable' : command.shortcut}
                  </span>
                </button>
              ))
            : results.map((result, index) => (
                <button
                  role="option"
                  tabIndex={-1}
                  id={`quick-result-${index}`}
                  aria-selected={selected === index}
                  className="search-result"
                  key={`${result.path}:${result.line}:${result.column}`}
                  onClick={() => activate(index)}
                >
                  <LuFileCode />
                  <span>
                    <b>
                      {result.relativePath}
                      {result.line !== undefined &&
                        `:${result.line + 1}:${(result.column ?? 0) + 1}`}
                    </b>
                    {result.preview !== undefined && (
                      <span className="search-preview">{result.preview}</span>
                    )}
                  </span>
                </button>
              ))}
          {count === 0 && (
            <div className="search-empty" role="status">
              {error ||
                (loading
                  ? 'Searching…'
                  : !props.project && props.mode !== 'commands'
                    ? 'Open a project folder to search its files.'
                    : props.mode === 'text' && !query
                      ? 'Type text to find matches across your project.'
                      : 'No results found.')}
            </div>
          )}
        </div>
        <div className="search-footer" role="status">
          <span>
            {truncated
              ? `Showing the first ${count} results. Narrow your search.`
              : `${count} result${count === 1 ? '' : 's'}`}
          </span>
          <span>↑↓ navigate · Enter open · Esc close</span>
        </div>
      </div>
    </div>
  )
}
