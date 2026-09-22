import { useCallback, useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import FileTree from './components/FileTree'
import Editor, { OpenFile } from './components/Editor'
import TerminalPanel from './components/TerminalPanel'
import AgentView from './components/AgentView'
import ModeChooser, { Mode } from './components/ModeChooser'
import type { Term } from './components/TermView'
import { disposeTerm } from './components/termStore'
import { applyTheme, applyTerminalFont } from './components/theme'
import { editorStatus } from './components/editorStore'
import { dragProps, dragSource, dropProps, move, moveById } from './components/dnd'
import GitTab from './tabs/GitTab'
import SummariesTab from './tabs/SummariesTab'
import TeamTab from './tabs/TeamTab'
import ProblemsTab from './tabs/ProblemsTab'
import type { Flow } from './tabs/types'
import {
  reveal as revealInEditor,
  subscribeProblems,
  updateDiagnostics,
  viewFor,
  clearDiagnostics
} from './components/lspExtensions'
import VaultModal from './components/VaultModal'
import SettingsModal, { type SettingsTab } from './components/SettingsModal'
import StatusBar from './components/StatusBar'
import SearchPopup from './components/SearchPopup'
import { modifierLabel, shortcutCommand, type Command } from './components/commands'
import Toasts, { type Toast } from './components/Toasts'
import { EmptyState, ViewHead } from './components/ui'
import { Blobs, SlidingIndicator } from './components/fx'
import { useDockMagnify, useTyping } from './components/fx-hooks'
import type {
  CommitDetail,
  HubStatus,
  Settings,
  PluginAgent,
  SearchMode,
  SearchResult
} from '../../preload/index.d'
import {
  LuFolderOpen,
  LuMoon,
  LuFiles,
  LuGitBranch,
  LuScrollText,
  LuSettings,
  LuPanelBottomClose,
  LuPanelBottomOpen,
  LuChevronDown,
  LuFolder,
  LuHistory,
  LuLayoutGrid,
  LuCode,
  LuNetwork,
  LuTriangleAlert,
  LuExternalLink,
  LuGripVertical,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuCrown
} from 'react-icons/lu'

type View = 'files' | 'git' | 'summaries' | 'team'
const VIEWS: { id: View; label: string; icon: React.JSX.Element }[] = [
  { id: 'files', label: 'Files', icon: <LuFiles /> },
  { id: 'git', label: 'Source control', icon: <LuGitBranch /> },
  { id: 'summaries', label: 'Summaries', icon: <LuScrollText /> },
  { id: 'team', label: 'Team', icon: <LuCrown /> }
]

type Slot = 'side' | 'main' | 'right' | 'bottom' | 'corner'
type PaneId = 'sidebar' | 'editor' | 'terminals' | 'problems'
/** Which pane sits in each slot; a slot with nothing in it shows a drop target. */
type Layout = Record<Slot, PaneId | null>
const SLOTS: Slot[] = ['side', 'main', 'right', 'bottom', 'corner']
const PANE_IDS: PaneId[] = ['sidebar', 'editor', 'terminals', 'problems']
const DEFAULT_LAYOUT: Layout = {
  side: 'sidebar',
  main: 'editor',
  right: null,
  bottom: 'terminals',
  corner: 'problems'
}
/** Which way a slot folds away when you collapse it. */
const SLOT_DIR: Record<Slot, 'left' | 'right' | 'up' | 'down'> = {
  side: 'left',
  main: 'up',
  right: 'right',
  // the bottom row is a horizontal pair, so these two fold sideways
  bottom: 'left',
  corner: 'right'
}

const PANE_NAMES: Record<PaneId, string> = {
  sidebar: 'the side panel',
  editor: 'the editor',
  terminals: 'the terminals',
  problems: 'problems'
}

const stored = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const store = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}
const base = (p: string): string => p.split('/').filter(Boolean).pop() ?? p
const storedList = (k: string, fallback: string[]): string[] => {
  try {
    const v = JSON.parse(stored(k) ?? 'null')
    return Array.isArray(v) && v.length ? v : fallback
  } catch {
    return fallback
  }
}

export default function App(): React.JSX.Element {
  const [project, setProject] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [hub, setHub] = useState<HubStatus | null>(null)
  const [files, setFiles] = useState<OpenFile[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  const [view, setView] = useState<View | null>(() => {
    const saved = stored('view')
    // the Agents and Activity views became one Team view
    return saved === 'agents' || saved === 'activity' ? 'team' : ((saved as View | null) ?? 'files')
  })
  const [terminalOnly, setTerminalOnly] = useState(() => stored('terminalOnly') === '1')
  const [mode, setModeState] = useState<Mode>(() => (stored('mode') === 'agent' ? 'agent' : 'ide'))
  const [chooser, setChooser] = useState(() => stored('modeRemember') !== '1')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('vault')
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
  const [pluginAgents, setPluginAgents] = useState<PluginAgent[]>([])
  const [commandError, setCommandError] = useState('')
  const searchReturnFocus = useRef<HTMLElement | null>(null)
  const projectVersion = useRef(0)
  const [severityCounts, setSeverityCounts] = useState({ errors: 0, warnings: 0 })
  const [vaultOpen, setVaultOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = (id: string): void => setToasts((t) => t.filter((x) => x.id !== id))
  const toast = (t: Omit<Toast, 'id'>, ttl = 0): string => {
    const id = crypto.randomUUID()
    setToasts((list) => [...list, { id, ...t }])
    if (ttl) setTimeout(() => dismiss(id), ttl)
    return id
  }
  const [problemCount, setProblemCount] = useState(0)
  const [problemsOpen, setProblemsOpen] = useState(() => stored('problemsOpen') !== '0')
  const toggleProblems = (): void => {
    store('problemsOpen', problemsOpen ? '0' : '1')
    setProblemsOpen(!problemsOpen)
  }
  useEffect(
    () =>
      subscribeProblems((snap) => {
        const diagnostics = [...snap.values()].flatMap((m) => [...m.values()]).flat()
        setProblemCount(diagnostics.length)
        setSeverityCounts({
          errors: diagnostics.filter((d) => d.severity === 'error').length,
          warnings: diagnostics.filter((d) => d.severity === 'warning').length
        })
      }),
    []
  )
  const [terms, setTerms] = useState<Term[]>([])
  const [workspaces, setWorkspaces] = useState<string[]>(() =>
    storedList('workspaces', ['General'])
  )
  const [ws, setWs] = useState<string>(() => storedList('workspaces', ['General'])[0])

  const setMode = (m: Mode): void => {
    setModeState(m)
    store('mode', m)
  }
  const pickMode = (m: Mode, remember: boolean): void => {
    setMode(m)
    store('modeRemember', remember ? '1' : '0')
    setChooser(false)
  }
  const saveWorkspaces = (list: string[]): void => {
    setWorkspaces(list)
    store('workspaces', JSON.stringify(list))
  }
  /** agent = base identity (claude, codex, plugin id); a second Claude becomes claude-2 / "Claude Code 2". */
  const addTerm = (name?: string, cmd?: string, agent?: string, cwd?: string): void => {
    const id = crypto.randomUUID()
    setTerms((t) => {
      let identity: string | undefined
      let label = name ?? `Shell ${t.length + 1}`
      if (agent) {
        const taken = new Set(t.map((x) => x.agent))
        let n = 1
        while (taken.has(n === 1 ? agent : `${agent}-${n}`)) n++
        identity = n === 1 ? agent : `${agent}-${n}`
        if (n > 1) label = `${label} ${n}`
      }
      return [...t, { id, name: label, cmd, agent: identity, ws, cwd }]
    })
  }
  // main has the last word on a terminal's hub identity, so mirror any rename it makes
  useEffect(
    () =>
      window.luna.pty.onAgent((id, agent) =>
        setTerms((t) => t.map((x) => (x.id === id ? { ...x, agent } : x)))
      ),
    []
  )
  /** Name a terminal whatever you like; its hub identity does not change. */
  const renameTerm = (id: string, name: string): void =>
    setTerms((t) => t.map((x) => (x.id === id ? { ...x, name } : x)))
  /** Drag one terminal onto another to swap their places. */
  const moveTerm = (from: string, to: string): void =>
    setTerms((t) => moveById(t, from, to, (x) => x.id))
  const moveWorkspace = (from: string, to: string): void =>
    saveWorkspaces(move(workspaces, workspaces.indexOf(from), workspaces.indexOf(to)))

  const closeTerm = (id: string): void => {
    window.luna.pty.kill(id)
    disposeTerm(id)
    setTerms((t) => t.filter((x) => x.id !== id))
  }
  const addWorkspace = (name: string): void => {
    let n = name
    for (let i = 2; workspaces.includes(n); i++) n = `${name} ${i}`
    saveWorkspaces([...workspaces, n])
    setWs(n)
  }
  const renameWorkspace = (from: string, to: string): void => {
    if (workspaces.includes(to)) return
    saveWorkspaces(workspaces.map((w) => (w === from ? to : w)))
    setTerms((t) => t.map((x) => (x.ws === from ? { ...x, ws: to } : x)))
    if (ws === from) setWs(to)
  }
  const closeWorkspace = (name: string): void => {
    terms
      .filter((t) => t.ws === name)
      .forEach((t) => {
        window.luna.pty.kill(t.id)
        disposeTerm(t.id)
      })
    setTerms((t) => t.filter((x) => x.ws !== name))
    const rest = workspaces.filter((w) => w !== name)
    saveWorkspaces(rest)
    if (ws === name) setWs(rest[0])
  }

  const navRef = useRef<HTMLElement>(null)
  useDockMagnify(navRef)
  const typed = useTyping(
    'Open a project folder. Your agents run in the terminals below and share notes through Luna.'
  )

  const pickView = (v: View | null): void => {
    const next = v === view ? null : v
    setView(next)
    store('view', next ?? '')
  }
  const toggleTerminalOnly = (): void => {
    store('terminalOnly', terminalOnly ? '0' : '1')
    setTerminalOnly(!terminalOnly)
  }

  useEffect(() => {
    window.luna.settings.get().then(setSettings)
    window.luna.hub.status().then(setHub)
    return window.luna.hub.onStatus(setHub)
  }, [])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    return window.luna.onFileChanged(() => {
      clearTimeout(t)
      t = setTimeout(() => setTreeVersion((v) => v + 1), 150)
    })
  }, [])

  useEffect(() => {
    if (view) store('lastView', view)
  }, [view])

  // A post from an agent gets a notification unless the Summaries view is already showing.
  // The set of known posts is seeded when the project opens, so nothing fires for old ones.
  useEffect(() => {
    if (!project) return
    let known: Set<string> | null = null
    window.luna.summaries.list().then((list) => (known = new Set(list.map((s) => s.file))))
    return window.luna.summaries.onChanged(() => {
      window.luna.summaries.list().then((list) => {
        if (!known) return
        const fresh = list.filter((s) => !known!.has(s.file))
        for (const s of fresh) known!.add(s.file)
        // the view in effect is mirrored to storage on every change
        if (!fresh.length || stored('view') === 'summaries') return
        const [top] = fresh
        const id = toast(
          {
            title:
              fresh.length > 1 ? `${fresh.length} new posts from the team` : `${top.agent} posted`,
            text: top.title,
            actions: [
              { label: 'Later', onClick: () => dismiss(id) },
              {
                label: 'Open',
                primary: true,
                onClick: () => {
                  dismiss(id)
                  setView('summaries')
                  store('view', 'summaries')
                }
              }
            ]
          },
          12000
        )
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  const openProject = async (dir: string | null): Promise<void> => {
    if (!dir) return
    const version = ++projectVersion.current
    setSearchMode(null)
    await window.luna.openProject(dir)
    if (version !== projectVersion.current) return
    clearDiagnostics()
    editorStatus.set(null)
    setProject(dir)
    setFiles([])
    setActive(null)
    setSettings(await window.luna.settings.get())
  }

  const openFile = useCallback(async (path: string, diff?: string, flow?: Flow) => {
    const version = projectVersion.current
    const content = await window.luna.readFile(path).catch(() => null)
    if (content === null || version !== projectVersion.current) return
    setFiles((fs) =>
      fs.some((f) => f.path === path)
        ? fs.map((f) =>
            f.path === path ? { ...f, diff: diff ?? f.diff, flow: diff ? flow : f.flow } : f
          )
        : [...fs, { path, content, saved: content, diff, flow }]
    )
    setActive(path)
  }, [])

  /** The tree renamed something: open tabs follow it (a folder carries everything under it). */
  const under = (path: string, dir: string): boolean => path === dir || path.startsWith(dir + '/')
  const renamePaths = (from: string, to: string): void => {
    const map = (p: string): string => (under(p, from) ? to + p.slice(from.length) : p)
    setFiles((fs) => fs.map((f) => (f.commit ? f : { ...f, path: map(f.path) })))
    setActive((a) => (a ? map(a) : a))
  }
  const closePaths = (dir: string): void => {
    setFiles((fs) => fs.filter((f) => f.commit || !under(f.path, dir)))
    setActive((a) => (a && under(a, dir) ? null : a))
  }

  /** Show a commit from the history as its own editor tab (IDE view only; agent view has no editor). */
  const openCommit = (commit: CommitDetail): void => {
    if (mode === 'agent') return
    if (terminalOnly) toggleTerminalOnly()
    const path = `commit:${commit.hash}`
    setFiles((fs) =>
      fs.some((f) => f.path === path)
        ? fs.map((f) => (f.path === path ? { ...f, commit } : f))
        : [...fs, { path, content: '', saved: '', commit }]
    )
    setActive(path)
  }

  const openDiff = (rel: string, fileDiff: string, flow?: Flow): void => {
    if (!project) return
    if (mode === 'agent') setMode('ide')
    if (terminalOnly) toggleTerminalOnly()
    openFile(rel.startsWith('/') ? rel : `${project}/${rel}`, fileDiff, flow)
  }

  // ponytail: the rail order is a list of view ids in localStorage; unknown ids are ignored and
  // any view missing from it (a new one) is appended, so the stored order can never hide a view.
  const [viewOrder, setViewOrder] = useState<View[]>(() => {
    const saved = storedList('luna:viewOrder', []) as View[]
    const known = saved.filter((id) => VIEWS.some((v) => v.id === id))
    return [...known, ...VIEWS.map((v) => v.id).filter((id) => !known.includes(id))]
  })
  const orderedViews = viewOrder.map((id) => VIEWS.find((v) => v.id === id)!).filter(Boolean)
  const moveView = (from: string, to: string): void =>
    setViewOrder((o) => {
      const next = move(o, o.indexOf(from as View), o.indexOf(to as View))
      store('luna:viewOrder', JSON.stringify(next))
      return next
    })

  // a torn-off window has no editor: it hands files back here
  useEffect(
    () =>
      window.luna.popout.onReveal((rel, diff) => {
        if (diff) openDiff(rel, diff)
        else openFile(rel.startsWith('/') ? rel : `${project}/${rel}`)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, mode, terminalOnly]
  )

  const theme = settings?.theme ?? 'system'
  useEffect(() => applyTheme(theme), [theme])
  const terminalFontSize = settings?.terminalFontSize ?? 13
  useEffect(() => applyTerminalFont(terminalFontSize), [terminalFontSize])

  const saveSetting = async (patch: Partial<Settings>): Promise<void> =>
    setSettings(await window.luna.settings.save(patch))

  const launch = (a: 'claude' | 'codex'): void => {
    addTerm(a === 'claude' ? 'Claude Code' : 'Codex', a, a)
    // registration lives in Settings; nudge with a notification only when it is actually missing
    window.luna.agents.status(a).then((st) => {
      if (st.registered) return
      const label = a === 'claude' ? 'Claude Code' : 'Codex'
      const id = toast({
        title: st.outdated
          ? `${label}'s hub setup needs an update`
          : `${label} isn't connected to the hub`,
        text: st.outdated
          ? 'It was registered before per-terminal identities existed, so tasks sent to this terminal would land in the wrong inbox. Re-register, then restart its terminals.'
          : 'Register once so it can post summaries, get tasks, and share memory through Luna.',
        actions: [
          { label: 'Later', onClick: () => dismiss(id) },
          {
            label: st.outdated ? 'Update' : 'Register',
            primary: true,
            onClick: () =>
              window.luna.agents.register(a).then((r) => {
                dismiss(id)
                toast({ title: `${label} registered`, text: r }, 9000)
              })
          }
        ]
      })
    })
  }
  const reveal = useCallback(
    (path: string, line: number, ch: number): void => {
      if (mode === 'agent') setMode('ide')
      if (terminalOnly) toggleTerminalOnly()
      openFile(path)
      revealInEditor(path, line, ch)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, terminalOnly, openFile]
  )
  const openSearch = (next: SearchMode): void => {
    if (!searchMode) searchReturnFocus.current = document.activeElement as HTMLElement | null
    setSearchMode(next)
  }
  const closeSearch = (restoreFocus = true): void => {
    setSearchMode(null)
    if (restoreFocus)
      requestAnimationFrame(
        () => searchReturnFocus.current?.isConnected && searchReturnFocus.current.focus()
      )
  }
  const openSettings = (tab: SettingsTab = 'vault'): void => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }
  useEffect(() => {
    const h = (e: Event): void => openSettings((e as CustomEvent<SettingsTab>).detail)
    window.addEventListener('luna:settings', h)
    return () => window.removeEventListener('luna:settings', h)
  })
  const showProblems = (): void => {
    setMode('ide')
    setProblemsOpen(true)
    store('problemsOpen', '1')
  }
  const saveFile = async (path: string): Promise<void> => {
    const file = files.find((f) => f.path === path)
    if (!file || file.commit) return
    // state content can lag ~200ms behind typing (Editor.tsx debounces it); the mounted view is always current.
    const content = viewFor(file.path)?.state.doc.toString() ?? file.content
    await window.luna.writeFile(file.path, content)
    setFiles((current) =>
      current.map((f) => (f.path === file.path ? { ...f, content, saved: content } : f))
    )
  }
  const saveActive = (): Promise<void> => (active ? saveFile(active) : Promise.resolve())
  const dirty = files.filter((f) => !f.commit && f.content !== f.saved)
  const saveAll = async (): Promise<void> => {
    for (const f of files) if (!f.commit) await saveFile(f.path)
  }
  /** ⌘W: the editor owns the close so a dirty tab can ask first. */
  const closeActive = (): void => {
    if (active) window.dispatchEvent(new CustomEvent('luna:close-tab', { detail: active }))
  }
  const mod = modifierLabel()
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const saved = JSON.parse(stored('luna:layout') ?? 'null')
      if (saved && typeof saved === 'object') {
        const seen = new Set<PaneId>()
        const next = { ...DEFAULT_LAYOUT }
        for (const slot of SLOTS) next[slot] = null
        for (const slot of SLOTS) {
          const pane = saved[slot]
          if (PANE_IDS.includes(pane) && !seen.has(pane)) {
            next[slot] = pane
            seen.add(pane)
          }
        }
        // any pane the saved layout lost goes back to its home slot
        for (const slot of SLOTS) {
          const home = DEFAULT_LAYOUT[slot]
          if (home && !seen.has(home) && !next[slot]) {
            next[slot] = home
            seen.add(home)
          }
        }
        return next
      }
    } catch {
      /* fall through to the default arrangement */
    }
    return { ...DEFAULT_LAYOUT }
  })
  /** Move a pane into a slot; whatever was there takes the pane's old place. */
  const movePane = (paneId: string, slot: string): void =>
    setLayout((l) => {
      const from = SLOTS.find((s) => l[s] === paneId)
      const to = slot as Slot
      if (!from || !SLOTS.includes(to) || from === to) return l
      const next = { ...l, [to]: l[from], [from]: l[to] }
      store('luna:layout', JSON.stringify(next))
      return next
    })
  const resetLayout = (): void => {
    setLayout({ ...DEFAULT_LAYOUT })
    store('luna:layout', JSON.stringify(DEFAULT_LAYOUT))
    setCollapsed({})
    store('luna:folded', '{}')
    for (const slot of SLOTS) panelApi.current.get(slot)?.expand()
  }
  const [collapsed, setCollapsed] = useState<Partial<Record<Slot, boolean>>>(() => {
    try {
      const saved = JSON.parse(stored('luna:folded') ?? '{}')
      return saved && typeof saved === 'object' ? saved : {}
    } catch {
      return {}
    }
  })
  const panelApi = useRef(new Map<Slot, PanelImperativeHandle | null>())
  /** Fold a slot away to a strip, or bring it back. The panel slides; see .sliding in styles.css. */
  const toggleCollapse = (slot: Slot): void => {
    const api = panelApi.current.get(slot)
    if (!api) return
    document.body.classList.add('sliding')
    setTimeout(() => document.body.classList.remove('sliding'), 320)
    const fold = !collapsed[slot]
    setCollapsed((c) => {
      const next = { ...c, [slot]: fold }
      store('luna:folded', JSON.stringify(next))
      return next
    })
    if (fold) api.collapse()
    else api.expand()
  }
  // The team prompt is the point of the app, so it is a view, not a dialog: unfold the sidebar
  // if it is tucked away, show the Team view, and put the cursor in the job box.
  const openTeam = (): void => {
    const slot = SLOTS.find((s) => layout[s] === 'sidebar')
    if (slot && collapsed[slot]) toggleCollapse(slot)
    setView('team')
    store('view', 'team')
    setTimeout(() => document.querySelector<HTMLTextAreaElement>('.team-text')?.focus(), 50)
  }
  // ponytail: a pixel threshold rather than isCollapsed(), so dragging a divider shut folds too
  const noteCollapsed = (slot: Slot, size: { inPixels: number }): void =>
    setCollapsed((c) => {
      const folded = size.inPixels <= 48
      return c[slot] === folded ? c : { ...c, [slot]: folded }
    })

  /** Panels remount only when a slot becomes empty or filled, not on an ordinary swap. */
  const emptySignature = SLOTS.map((s) => (layout[s] ? 1 : 0)).join('')
  const groupKey = `${view ? 1 : 0}-${terminalOnly ? 1 : 0}-${mode}-${problemsOpen ? 1 : 0}-${emptySignature}`
  // a fresh Panel always mounts expanded, so every remount of the tree above (tied to groupKey)
  // needs its folded slots collapsed again — not just the very first time panels exist.
  useEffect(() => {
    if (mode !== 'ide') return
    for (const slot of SLOTS) if (collapsed[slot]) panelApi.current.get(slot)?.collapse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey])
  /** The Problems pane only takes its slot while it is switched on. */
  const slotShown = (s: Slot): boolean => layout[s] !== 'problems' || problemsOpen
  const slotProps = (slot: Slot): ReturnType<typeof dropProps> =>
    dropProps(slot, 'luna/pane', movePane)

  const commands: Command[] = [
    {
      id: 'search.files',
      label: 'Find File',
      keywords: 'search quick open',
      shortcut: `${mod}P`,
      run: () => openSearch('files')
    },
    {
      id: 'search.text',
      label: 'Find in Project',
      keywords: 'find all search text',
      shortcut: `${mod}⇧F`,
      run: () => openSearch('text')
    },
    {
      id: 'search.commands',
      label: 'Show All Commands',
      keywords: 'command palette',
      shortcut: `${mod}⇧P`,
      run: () => openSearch('commands')
    },
    {
      id: 'folder.open',
      label: 'Open Folder',
      run: () => window.luna.openFolder().then(openProject)
    },
    {
      id: 'file.save',
      label: 'Save Active File',
      shortcut: `${mod}S`,
      enabled: !!active,
      run: saveActive
    },
    {
      id: 'file.saveAll',
      label: 'Save All',
      keywords: 'write every dirty',
      shortcut: `${mod}⇧S`,
      enabled: dirty.length > 0,
      run: saveAll
    },
    {
      id: 'file.close',
      label: 'Close Tab',
      shortcut: `${mod}W`,
      enabled: !!active,
      run: closeActive
    },
    {
      id: 'file.closeAll',
      label: 'Close Saved Tabs',
      keywords: 'close all others',
      enabled: files.length > 0,
      // tabs with unsaved edits stay open, so nothing is lost without a word; the editor decides
      // which those are, since it holds the edit not yet flushed to state
      run: () => window.dispatchEvent(new Event('luna:close-saved'))
    },
    ...(['next', 'prev'] as const).map((dir) => ({
      id: `tab.${dir}`,
      label: dir === 'next' ? 'Next Tab' : 'Previous Tab',
      shortcut: `${mod}⇧${dir === 'next' ? ']' : '['}`,
      enabled: files.length > 1,
      run: () => {
        const i = files.findIndex((f) => f.path === active)
        const n = files.length
        setActive(files[((i < 0 ? 0 : i) + (dir === 'next' ? 1 : n - 1)) % n].path)
      }
    })),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
      id: `tab.${n}`,
      label: `Go to Tab ${n}`,
      shortcut: `${mod}${n}`,
      enabled: files.length >= n,
      run: () => setActive(files[n - 1].path)
    })),
    { id: 'mode.ide', label: 'Switch to IDE Mode', run: () => setMode('ide') },
    { id: 'mode.agent', label: 'Switch to Agents Mode', run: () => setMode('agent') },
    {
      id: 'view.sidebar',
      label: 'Toggle Sidebar',
      shortcut: `${mod}B`,
      run: () => pickView(view || (stored('lastView') as View) || 'files')
    },
    {
      id: 'view.terminal',
      label: 'Toggle Editor / Terminals Only',
      shortcut: `${mod}J`,
      enabled: mode === 'ide',
      run: toggleTerminalOnly
    },
    {
      id: 'view.resetLayout',
      label: 'Reset Pane Layout',
      keywords: 'panes arrange move drag default',
      enabled: mode === 'ide',
      run: resetLayout
    },
    {
      id: 'view.problems',
      label: 'Toggle Problems',
      run: () => {
        if (mode === 'agent') showProblems()
        else toggleProblems()
      }
    },
    ...VIEWS.map((v) => ({
      id: `view.${v.id}`,
      label: `Show ${v.label}`,
      run: () => {
        setView(v.id)
        store('view', v.id)
      }
    })),
    {
      id: 'settings.open',
      label: 'Open Settings',
      shortcut: `${mod},`,
      enabled: !!settings,
      run: () => openSettings()
    },
    {
      id: 'settings.plugins',
      label: 'Manage Plugins',
      keywords: 'extensions install create',
      enabled: !!settings,
      run: () => openSettings('extensions')
    },
    {
      id: 'vault.open',
      label: 'Open Vault Graph',
      enabled: !!project,
      run: () => setVaultOpen(true)
    },
    { id: 'terminal.new', label: 'New Terminal', enabled: !!project, run: () => addTerm() },
    {
      id: 'agent.claude',
      label: 'Launch Claude Code',
      enabled: !!project,
      run: () => launch('claude')
    },
    { id: 'agent.codex', label: 'Launch Codex', enabled: !!project, run: () => launch('codex') },
    ...pluginAgents.map((agent, index) => ({
      id: `plugin.${agent.id}.${index}`,
      label: `Launch ${agent.name}`,
      keywords: 'plugin agent terminal',
      enabled: !!project,
      run: () => addTerm(agent.name, agent.command, agent.id)
    })),
    {
      id: 'team.open',
      label: 'Team Prompt',
      keywords: 'planner coders delegate leader',
      shortcut: `${mod}T`,
      enabled: !!project,
      run: openTeam
    }
  ]
  const execute = (command: Command): void => {
    if (command.enabled === false) return
    setCommandError('')
    Promise.resolve()
      .then(command.run)
      .catch((error) => setCommandError(error instanceof Error ? error.message : String(error)))
  }
  const openResult = (result: SearchResult): void => {
    closeSearch(false)
    reveal(result.path, result.line ?? 0, result.column ?? 0)
  }

  useEffect(() => {
    const refresh = (): void => {
      window.luna.plugins
        .agents()
        .then(setPluginAgents)
        .catch(() => setPluginAgents([]))
    }
    refresh()
    return window.luna.plugins.onChanged(refresh)
  }, [])
  useEffect(
    () =>
      window.luna.lsp.onDiagnostics((path, source, diagnostics) => {
        if (files.some((file) => file.path === path))
          updateDiagnostics(path, source, diagnostics, viewFor(path))
      }),
    [files]
  )
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (settingsOpen || vaultOpen || chooser || event.defaultPrevented) return
      // Other dialogs/editing popovers retain their shortcuts as well.
      if (!searchMode && document.activeElement?.closest('[role="dialog"], .modal-backdrop')) return
      const id = shortcutCommand(event)
      if (!id || (searchMode && !id.startsWith('search.'))) return
      const command = commands.find((item) => item.id === id)
      if (!command) return
      event.preventDefault()
      event.stopPropagation()
      execute(command)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // ponytail: five fixed slots, and the user says which pane lives in each. Dragging a pane's grip
  // onto a slot moves it there and the slot's old pane takes its place — enough to rearrange the
  // IDE without a docking engine. A slot with nothing in it is a drop target you can fill.
  const arrowFor = (slot: Slot, open: boolean): React.JSX.Element => {
    const dir = SLOT_DIR[slot]
    // pointing the way it will move
    if (dir === 'left') return open ? <LuChevronLeft /> : <LuChevronRight />
    if (dir === 'right') return open ? <LuChevronRight /> : <LuChevronLeft />
    if (dir === 'up') return open ? <LuChevronUp /> : <LuChevronDown />
    return open ? <LuChevronDown /> : <LuChevronUp />
  }

  const pane = (slot: Slot): React.JSX.Element => {
    const c = layout[slot]
    if (collapsed[slot] && c)
      return (
        <div className="pane-swap strip-body" key={'folded:' + slot} {...slotProps(slot)}>
          <button
            className="strip-open"
            title={`Show ${PANE_NAMES[c]}`}
            aria-label={`Show ${PANE_NAMES[c]}`}
            onClick={() => toggleCollapse(slot)}
          >
            {arrowFor(slot, false)}
            <span>{PANE_NAMES[c]}</span>
          </button>
        </div>
      )
    if (!c)
      return (
        <div className="pane-swap empty" key={'empty:' + slot} {...slotProps(slot)}>
          <div className="slot-empty">
            {arrowFor(slot, false)}
            <span>Drag a panel here</span>
          </div>
        </div>
      )
    return (
      // keyed by content: the slot keeps its size and the new content settles in.
      // The drop handlers live here, not on the Panel: the panels library keeps extra props on a
      // wrapper of its own, so the highlight would land on an element we cannot style.
      <div className="pane-swap" key={c} {...slotProps(slot)}>
        <div className="pane-rail">
          <button
            className="pane-grip"
            title={`Drag to move ${PANE_NAMES[c]}`}
            aria-label={`Move ${PANE_NAMES[c]}`}
            {...dragSource(c, 'luna/pane', PANE_NAMES[c])}
          >
            <LuGripVertical />
          </button>
          <button
            className="pane-fold"
            title={`Hide ${PANE_NAMES[c]}`}
            aria-label={`Hide ${PANE_NAMES[c]}`}
            onClick={() => toggleCollapse(slot)}
          >
            {arrowFor(slot, true)}
          </button>
        </div>
        {c === 'sidebar' ? (
          <>
            {view === 'files' && (
              <>
                <ViewHead title={project ? base(project) : 'Files'} />
                {project ? (
                  <FileTree
                    root={project}
                    version={treeVersion}
                    active={active}
                    onOpen={openFile}
                    onRenamed={renamePaths}
                    onDeleted={closePaths}
                    onTerminal={(dir) => addTerm(base(dir), undefined, undefined, dir)}
                  />
                ) : (
                  <EmptyState
                    icon={<LuFolder />}
                    title="No project"
                    text="Open a folder to browse its files."
                  />
                )}
              </>
            )}
            {settings && view === 'git' && <GitTab {...tabProps} />}
            {settings && view === 'summaries' && <SummariesTab {...tabProps} />}
            {settings && view === 'team' && <TeamTab {...tabProps} terms={terms} />}
          </>
        ) : c === 'editor' ? (
          project ? (
            <Editor
              files={files}
              setFiles={setFiles}
              active={active}
              setActive={setActive}
              problems={problemCount}
              problemsOpen={problemsOpen}
              onToggleProblems={toggleProblems}
              onStatus={editorStatus.set}
              onOpenFile={openDiff}
              onSave={saveFile}
              autosave={settings?.autosave}
              fontSize={settings?.editorFontSize}
              tabSize={settings?.tabSize}
              wordWrap={settings?.wordWrap}
              onGoto={reveal}
            />
          ) : (
            welcome
          )
        ) : c === 'terminals' ? (
          <TerminalPanel
            cwd={project}
            terms={terms}
            onAdd={addTerm}
            onClose={closeTerm}
            onMove={moveTerm}
            onRename={renameTerm}
          />
        ) : settings ? (
          <ProblemsTab {...tabProps} onClose={toggleProblems} />
        ) : (
          <></>
        )}
      </div>
    )
  }

  const tabProps = {
    project,
    settings: settings!,
    saveSetting,
    openDiff,
    launch,
    reveal,
    openCommit,
    openTerminal: (name: string, cmd: string) => addTerm(name, cmd)
  }
  const recent = settings?.recentProjects ?? []

  const welcome = (
    <EmptyState icon={<LuMoon />} title="Welcome to Luna" text={typed}>
      <button className="primary" onClick={() => window.luna.openFolder().then(openProject)}>
        <LuFolderOpen /> Open Folder
      </button>
      {recent.slice(0, 4).map((p) => (
        <button key={p} onClick={() => openProject(p)} title={p}>
          <LuHistory /> {base(p)}
        </button>
      ))}
    </EmptyState>
  )

  return (
    <div className="app">
      <Blobs />
      {searchMode && (
        <SearchPopup
          key={`${project}-${searchMode}`}
          mode={searchMode}
          project={project}
          files={files}
          commands={commands}
          onMode={setSearchMode}
          onClose={closeSearch}
          onResult={openResult}
          onCommand={(command) => {
            closeSearch()
            requestAnimationFrame(() => execute(command))
          }}
        />
      )}
      {commandError && (
        <div className="command-error" role="alert">
          {commandError}
          <button onClick={() => setCommandError('')}>Dismiss</button>
        </div>
      )}
      {chooser && <ModeChooser onPick={pickMode} />}
      <Toasts toasts={toasts} onDismiss={dismiss} />
      {vaultOpen && (
        <VaultModal
          onClose={() => setVaultOpen(false)}
          onOpen={(p) => {
            if (mode === 'agent') setMode('ide')
            if (terminalOnly) toggleTerminalOnly()
            openFile(p)
          }}
        />
      )}
      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          initialTab={settingsTab}
          save={saveSetting}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <header className="titlebar">
        <span className="brand">
          <span className="brand-mark">
            <LuMoon />
          </span>
          <span className="word">Luna</span>
        </span>
        <span className="project-chip" title={project ?? ''}>
          <LuFolder />
          {project ? (
            <>
              <b>{base(project)}</b>
              <span className="dim">{project.slice(0, -base(project).length)}</span>
            </>
          ) : (
            <span className="dim">No project open</span>
          )}
        </span>
        <span className="spacer" />
        <span className="segmented" title="Switch view">
          <SlidingIndicator activeSelector="button.on" deps={[mode]} />
          <button className={mode === 'agent' ? 'on' : ''} onClick={() => setMode('agent')}>
            <LuLayoutGrid /> Agents
          </button>
          <button className={mode === 'ide' ? 'on' : ''} onClick={() => setMode('ide')}>
            <LuCode /> IDE
          </button>
        </span>
        <button
          className="primary team-cta"
          disabled={!project}
          title={`Give the team one job (${mod}T)`}
          onClick={openTeam}
        >
          <LuCrown /> <span className="cta-label">Team prompt</span>
        </button>
        <span className={'pill ' + (hub?.running ? 'ok' : 'warn')} title="MCP hub">
          <i />
          {hub?.running ? `hub :${hub.port}` : 'hub off'}
        </span>
        {recent.length > 0 && (
          <span className="select-pill">
            <LuHistory />
            <select value="" onChange={(e) => openProject(e.target.value)}>
              <option value="">Recent</option>
              {recent.map((p) => (
                <option key={p} value={p}>
                  {base(p)} — {p}
                </option>
              ))}
            </select>
            <LuChevronDown />
          </span>
        )}
        <button onClick={() => window.luna.openFolder().then(openProject)}>
          <LuFolderOpen /> Open
        </button>
      </header>

      <div className="body">
        <nav className="activity" ref={navRef}>
          {orderedViews.map((v) => (
            <button
              key={v.id}
              className={'act' + (view === v.id ? ' active' : '')}
              data-tip={v.label + ' — drag to reorder'}
              aria-label={v.label}
              onClick={() => pickView(v.id)}
              {...dragProps(v.id, 'luna/view', moveView)}
            >
              {v.icon}
            </button>
          ))}
          <button
            className="act"
            data-tip="Pop this view out into its own window"
            aria-label="Pop out this view"
            onClick={() => window.luna.popout.open(view ?? 'files')}
          >
            <LuExternalLink />
          </button>
          {mode === 'ide' && (
            <button
              className={'act' + (problemsOpen ? ' active' : '')}
              data-tip="Problems"
              aria-label="Toggle problems section"
              aria-pressed={problemsOpen}
              onClick={toggleProblems}
            >
              <LuTriangleAlert />
              {problemCount > 0 && <span className="act-cnt">{problemCount}</span>}
            </button>
          )}
          <span className="spacer" />
          <button
            className={'act' + (vaultOpen ? ' active' : '')}
            data-tip="Vault graph"
            aria-label="Vault graph"
            onClick={() => setVaultOpen(true)}
          >
            <LuNetwork />
          </button>
          <button
            className={'act' + (settingsOpen ? ' active' : '')}
            data-tip="Settings  ⌘,"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <LuSettings />
          </button>
          {mode === 'ide' && (
            <button
              className={'act' + (terminalOnly ? ' active' : '')}
              data-tip={terminalOnly ? 'Show editor  ⌘J' : 'Terminals only  ⌘J'}
              aria-label="Toggle editor"
              onClick={toggleTerminalOnly}
            >
              {terminalOnly ? <LuPanelBottomClose /> : <LuPanelBottomOpen />}
            </button>
          )}
        </nav>

        <Group key={groupKey} orientation="horizontal" className="group">
          {view && slotShown('side') && (
            <>
              <Panel
                defaultSize={340}
                minSize={200}
                maxSize={layout.side === 'sidebar' ? 640 : undefined}
                collapsible
                collapsedSize={40}
                panelRef={(api) => {
                  panelApi.current.set('side', api)
                }}
                onResize={(size) => noteCollapsed('side', size)}
                className={'pane ' + (layout.side ?? 'blank') + (collapsed.side ? ' folded' : '')}
              >
                {pane('side')}
              </Panel>
              <Separator className="sep" />
            </>
          )}
          <Panel className="main">
            {mode === 'agent' ? (
              <div className="pane agent-pane">
                <AgentView
                  cwd={project}
                  terms={terms}
                  workspaces={workspaces}
                  active={ws}
                  onPick={setWs}
                  onAddWorkspace={addWorkspace}
                  onRenameWorkspace={renameWorkspace}
                  onCloseWorkspace={closeWorkspace}
                  onAdd={addTerm}
                  onClose={closeTerm}
                  onMoveTerm={moveTerm}
                  onMoveWorkspace={moveWorkspace}
                  onRenameTerm={renameTerm}
                />
              </div>
            ) : (
              <Group orientation="vertical" className="group">
                {!terminalOnly && slotShown('main') && (
                  <>
                    <Panel minSize={120} className="main">
                      <Group orientation="horizontal" className="group">
                        <Panel
                          minSize={200}
                          collapsible
                          collapsedSize={40}
                          panelRef={(api) => {
                            panelApi.current.set('main', api)
                          }}
                          onResize={(size) => noteCollapsed('main', size)}
                          className={
                            'pane ' + (layout.main ?? 'blank') + (collapsed.main ? ' folded' : '')
                          }
                        >
                          {pane('main')}
                        </Panel>
                        {slotShown('right') && (
                          <>
                            <Separator className="sep" />
                            <Panel
                              defaultSize={layout.right ? 340 : 40}
                              minSize={layout.right ? 220 : 40}
                              maxSize={layout.right ? undefined : 40}
                              collapsible={!!layout.right}
                              collapsedSize={40}
                              panelRef={(api) => {
                                panelApi.current.set('right', api)
                              }}
                              onResize={(size) => noteCollapsed('right', size)}
                              className={
                                'pane ' +
                                (layout.right ?? 'blank strip') +
                                (collapsed.right ? ' folded' : '')
                              }
                            >
                              {pane('right')}
                            </Panel>
                          </>
                        )}
                      </Group>
                    </Panel>
                    <Separator className="sep" />
                  </>
                )}
                <Panel defaultSize={terminalOnly ? undefined : 240} minSize={120} className="main">
                  <Group orientation="horizontal" className="group">
                    {slotShown('bottom') && (
                      <Panel
                        minSize={200}
                        collapsible
                        collapsedSize={40}
                        panelRef={(api) => {
                          panelApi.current.set('bottom', api)
                        }}
                        onResize={(size) => noteCollapsed('bottom', size)}
                        className={
                          'pane ' + (layout.bottom ?? 'blank') + (collapsed.bottom ? ' folded' : '')
                        }
                      >
                        {pane('bottom')}
                      </Panel>
                    )}
                    {slotShown('corner') && (
                      <>
                        {slotShown('bottom') && <Separator className="sep" />}
                        <Panel
                          defaultSize={320}
                          minSize={240}
                          maxSize={undefined}
                          collapsible
                          collapsedSize={40}
                          panelRef={(api) => {
                            panelApi.current.set('corner', api)
                          }}
                          onResize={(size) => noteCollapsed('corner', size)}
                          className={
                            'pane ' +
                            (layout.corner ?? 'blank') +
                            (collapsed.corner ? ' folded' : '')
                          }
                        >
                          {pane('corner')}
                        </Panel>
                      </>
                    )}
                  </Group>
                </Panel>
              </Group>
            )}
          </Panel>
        </Group>
      </div>
      <StatusBar
        project={project}
        errors={severityCounts.errors}
        warnings={severityCounts.warnings}
        active={active}
        showEditor={mode === 'ide' && !terminalOnly}
        hub={hub}
        onGit={() => {
          setView('git')
          store('view', 'git')
        }}
        onProblems={showProblems}
        onSearch={() => openSearch('files')}
        onHub={() => openSettings('hub')}
      />
    </div>
  )
}
