import { useEffect, useState } from 'react'
import type { Entry } from '../../../preload/index.d'
import { LuChevronRight, LuFolder, LuFolderOpen, LuFile } from 'react-icons/lu'

type Props = {
  root: string
  version: number
  active: string | null
  onOpen: (p: string) => void
  /** A file or folder changed its path (folders carry everything under them). */
  onRenamed?: (from: string, to: string) => void
  onDeleted?: (path: string) => void
  /** "Open terminal here": a shell in that folder. */
  onTerminal?: (dir: string) => void
}

const parent = (p: string): string => p.slice(0, p.lastIndexOf('/'))

export default function FileTree({
  root,
  version,
  active,
  onOpen,
  onRenamed,
  onDeleted,
  onTerminal
}: Props): React.JSX.Element {
  // expanded dir path -> its entries
  const [dirs, setDirs] = useState<Record<string, Entry[]>>({})
  // a node being renamed in place, and the draft name
  const [editing, setEditing] = useState<{ path: string; draft: string } | null>(null)

  useEffect(() => {
    window.luna.readDir(root).then((e) => setDirs({ [root]: e }))
  }, [root])

  // refresh every expanded dir when the watcher fires
  useEffect(() => {
    if (!version) return
    Promise.all(
      Object.keys(dirs).map(
        async (d) => [d, await window.luna.readDir(d).catch(() => null)] as const
      )
    ).then((pairs) =>
      setDirs(Object.fromEntries(pairs.filter(([, e]) => e) as [string, Entry[]][]))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const reload = async (dir: string): Promise<void> => {
    const entries = await window.luna.readDir(dir).catch(() => null)
    if (entries) setDirs((d) => ({ ...d, [dir]: entries }))
  }

  const toggle = async (e: Entry): Promise<void> => {
    if (!e.dir) return onOpen(e.path)
    if (dirs[e.path]) {
      const next = { ...dirs }
      delete next[e.path]
      setDirs(next)
    } else {
      setDirs({ ...dirs, [e.path]: await window.luna.readDir(e.path) })
    }
  }

  /** Make the file or folder, show it, and start renaming it right away. */
  const create = async (dir: string, folder: boolean): Promise<void> => {
    const path = await window.luna.fs.create(dir, folder ? 'New folder' : 'untitled', folder)
    if (!dirs[dir]) setDirs((d) => ({ ...d, [dir]: [] }))
    await reload(dir)
    if (!folder) onOpen(path)
    setEditing({ path, draft: path.split('/').pop() ?? '' })
  }
  const commitRename = async (): Promise<void> => {
    const e = editing
    setEditing(null)
    if (!e) return
    const name = e.draft.trim()
    if (!name || name.includes('/') || name === e.path.split('/').pop()) return
    try {
      const to = await window.luna.fs.rename(e.path, name)
      onRenamed?.(e.path, to)
      // an expanded folder keeps its listing under the new path
      if (dirs[e.path]) {
        const next = Object.fromEntries(
          Object.entries(dirs).map(([k, v]) => [k === e.path ? to : k, v])
        )
        setDirs(next)
      }
      await reload(parent(e.path))
    } catch (err) {
      window.alert?.(err instanceof Error ? err.message : String(err))
    }
  }

  const menu = async (e: Entry | null, ev: React.MouseEvent): Promise<void> => {
    ev.preventDefault()
    ev.stopPropagation()
    const dir = !e ? root : e.dir ? e.path : parent(e.path)
    const items = [
      { id: 'newFile', label: 'New File' },
      { id: 'newFolder', label: 'New Folder' },
      ...(e
        ? [
            { id: '-', label: '' },
            { id: 'rename', label: 'Rename' },
            { id: 'trash', label: 'Move to Trash' }
          ]
        : []),
      { id: '-', label: '' },
      { id: 'reveal', label: 'Reveal in Finder' },
      { id: 'copy', label: 'Copy Path' },
      { id: 'copyRel', label: 'Copy Relative Path' },
      ...(onTerminal ? [{ id: 'terminal', label: 'Open Terminal Here' }] : [])
    ]
    const pick = await window.luna.contextMenu(items)
    const target = e?.path ?? root
    if (pick === 'newFile') create(dir, false)
    else if (pick === 'newFolder') create(dir, true)
    else if (pick === 'rename' && e) setEditing({ path: e.path, draft: e.name })
    else if (pick === 'trash' && e) {
      await window.luna.fs.trash(e.path)
      onDeleted?.(e.path)
      reload(parent(e.path))
    } else if (pick === 'reveal') window.luna.fs.reveal(target)
    else if (pick === 'copy') navigator.clipboard.writeText(target)
    else if (pick === 'copyRel') navigator.clipboard.writeText(target.slice(root.length + 1) || '.')
    else if (pick === 'terminal') onTerminal?.(dir)
  }

  const render = (dir: string, depth: number): React.JSX.Element[] =>
    (dirs[dir] ?? []).map((e) => (
      <div key={e.path}>
        <div
          className={'node' + (e.path === active ? ' active' : '')}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => toggle(e)}
          onContextMenu={(ev) => menu(e, ev)}
        >
          <span className={'arrow' + (dirs[e.path] ? ' open' : '')}>
            {e.dir && <LuChevronRight />}
          </span>
          {e.dir ? (
            dirs[e.path] ? (
              <LuFolderOpen className="ico" />
            ) : (
              <LuFolder className="ico" />
            )
          ) : (
            <LuFile className="ico" />
          )}
          {editing?.path === e.path ? (
            <input
              autoFocus
              className="inline"
              value={editing.draft}
              onFocus={(ev) => {
                // select the stem, not the extension, like the Finder does
                const dot = e.dir ? -1 : ev.currentTarget.value.lastIndexOf('.')
                ev.currentTarget.setSelectionRange(0, dot > 0 ? dot : ev.currentTarget.value.length)
              }}
              onChange={(ev) => setEditing({ path: e.path, draft: ev.target.value })}
              onBlur={commitRename}
              onClick={(ev) => ev.stopPropagation()}
              onKeyDown={(ev) => {
                ev.stopPropagation()
                if (ev.key === 'Enter') commitRename()
                else if (ev.key === 'Escape') setEditing(null)
              }}
            />
          ) : (
            e.name
          )}
        </div>
        {e.dir && dirs[e.path] && render(e.path, depth + 1)}
      </div>
    ))

  return (
    <div className="tree" onContextMenu={(ev) => menu(null, ev)}>
      {render(root, 0)}
    </div>
  )
}
