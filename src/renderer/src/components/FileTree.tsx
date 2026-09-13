import { useEffect, useState } from 'react'
import type { Entry } from '../../../preload/index.d'
import { LuChevronRight, LuFolder, LuFolderOpen, LuFile } from 'react-icons/lu'

type Props = { root: string; version: number; active: string | null; onOpen: (p: string) => void }

export default function FileTree({ root, version, active, onOpen }: Props): React.JSX.Element {
  // expanded dir path -> its entries
  const [dirs, setDirs] = useState<Record<string, Entry[]>>({})

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

  const render = (dir: string, depth: number): React.JSX.Element[] =>
    (dirs[dir] ?? []).map((e) => (
      <div key={e.path}>
        <div
          className={'node' + (e.path === active ? ' active' : '')}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => toggle(e)}
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
          {e.name}
        </div>
        {e.dir && dirs[e.path] && render(e.path, depth + 1)}
      </div>
    ))

  return <div className="tree">{render(root, 0)}</div>
}
