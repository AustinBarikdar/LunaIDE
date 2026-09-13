import { useCallback, useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import FileTree from './components/FileTree'
import Editor, { OpenFile } from './components/Editor'
import TerminalPanel from './components/TerminalPanel'
import AgentView from './components/AgentView'
import ModeChooser, { Mode } from './components/ModeChooser'
import type { Term } from './components/TermView'
import { disposeTerm } from './components/termStore'
import GitTab from './tabs/GitTab'
import SummariesTab from './tabs/SummariesTab'
import AgentsTab from './tabs/AgentsTab'
import ActivityTab from './tabs/ActivityTab'
import ProblemsTab from './tabs/ProblemsTab'
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
import {
  modifierLabel,
  shortcutCommand,
  type Command,
  type EditorStatus
} from './components/commands'
import FlowerMenu from './components/FlowerMenu'
import TeamModal from './components/TeamModal'
import Toasts, { type Toast } from './components/Toasts'
import { EmptyState, ViewHead } from './components/ui'
import { Blobs, SlidingIndicator } from './components/fx'
import { useDockMagnify, useTyping } from './components/fx-hooks'
import type {
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
  LuBot,
  LuSettings,
  LuPanelBottomClose,
  LuPanelBottomOpen,
  LuChevronDown,
  LuFolder,
  LuHistory,
  LuLayoutGrid,
  LuCode,
  LuSparkles,
  LuBot as LuBotIcon,
  LuMessagesSquare,
  LuNetwork,
  LuTriangleAlert,
  LuCrown
} from 'react-icons/lu'

type View = 'files' | 'git' | 'summaries' | 'agents' | 'activity'
const VIEWS: { id: View; label: string; icon: React.JSX.Element }[] = [
  { id: 'files', label: 'Files', icon: <LuFiles /> },
  { id: 'git', label: 'Source control', icon: <LuGitBranch /> },
  { id: 'summaries', label: 'Summaries', icon: <LuScrollText /> },
  { id: 'agents', label: 'Agents & team', icon: <LuBot /> },
  { id: 'activity', label: 'Activity', icon: <LuMessagesSquare /> }
]

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
  const [view, setView] = useState<View | null>(() => (stored('view') as View | null) ?? 'files')
  const [terminalOnly, setTerminalOnly] = useState(() => stored('terminalOnly') === '1')
  const [mode, setModeState] = useState<Mode>(() => (stored('mode') === 'agent' ? 'agent' : 'ide'))
  const [chooser, setChooser] = useState(() => stored('modeRemember') !== '1')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('vault')
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
  const [editorStatus, setEditorStatus] = useState<EditorStatus | null>(null)
  const [pluginAgents, setPluginAgents] = useState<PluginAgent[]>([])
  const [commandError, setCommandError] = useState('')
  const searchReturnFocus = useRef<HTMLElement | null>(null)
  const projectVersion = useRef(0)
  const [severityCounts, setSeverityCounts] = useState({ errors: 0, warnings: 0 })
  const [vaultOpen, setVaultOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
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
  const addTerm = (name?: string, cmd?: string, agent?: string): void => {
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
      return [...t, { id, name: label, cmd, agent: identity, ws }]
    })
  }
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

  const openProject = async (dir: string | null): Promise<void> => {
    if (!dir) return
    const version = ++projectVersion.current
    setSearchMode(null)
    await window.luna.openProject(dir)
    if (version !== projectVersion.current) return
    clearDiagnostics()
    setEditorStatus(null)
    setProject(dir)
    setFiles([])
    setActive(null)
    setSettings(await window.luna.settings.get())
  }

  const openFile = useCallback(async (path: string, diff?: string) => {
    const version = projectVersion.current
    const content = await window.luna.readFile(path).catch(() => null)
    if (content === null || version !== projectVersion.current) return
    setFiles((fs) =>
      fs.some((f) => f.path === path)
        ? fs.map((f) => (f.path === path ? { ...f, diff: diff ?? f.diff } : f))
        : [...fs, { path, content, saved: content, diff }]
    )
    setActive(path)
  }, [])

  const openDiff = (rel: string, fileDiff: string): void => {
    if (!project) return
    if (mode === 'agent') setMode('ide')
    if (terminalOnly) toggleTerminalOnly()
    openFile(rel.startsWith('/') ? rel : `${project}/${rel}`, fileDiff)
  }

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
  const reveal = (path: string, line: number, ch: number): void => {
    if (mode === 'agent') setMode('ide')
    if (terminalOnly) toggleTerminalOnly()
    openFile(path)
    revealInEditor(path, line, ch)
  }
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
  const saveActive = async (): Promise<void> => {
    const file = files.find((f) => f.path === active)
    if (!file) return
    await window.luna.writeFile(file.path, file.content)
    setFiles((current) =>
      current.map((f) => (f.path === file.path ? { ...f, saved: file.content } : f))
    )
  }
  const mod = modifierLabel()
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
      enabled: !!project,
      run: () => setTeamOpen(true)
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
      if (settingsOpen || vaultOpen || teamOpen || chooser || event.defaultPrevented) return
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

  const openTeam = (): void => setTeamOpen(true)
  const tabProps = { project, settings: settings!, saveSetting, openDiff, launch, reveal, openTeam }
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
      {teamOpen && (
        <TeamModal
          terms={terms}
          project={project}
          onClose={() => setTeamOpen(false)}
          onLaunch={launch}
        />
      )}
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

      <FlowerMenu
        items={[
          ...VIEWS.map((v) => ({
            icon: v.icon,
            label: v.label,
            active: view === v.id,
            onClick: () => pickView(v.id)
          })),
          {
            icon: mode === 'agent' ? <LuCode /> : <LuLayoutGrid />,
            label: mode === 'agent' ? 'Switch to IDE view' : 'Switch to Agent view',
            onClick: () => setMode(mode === 'agent' ? 'ide' : 'agent')
          },
          { icon: <LuCrown />, label: 'Team prompt', onClick: () => setTeamOpen(true) },
          { icon: <LuSparkles />, label: 'Launch Claude Code', onClick: () => launch('claude') },
          { icon: <LuBotIcon />, label: 'Launch Codex', onClick: () => launch('codex') },
          { icon: <LuNetwork />, label: 'Vault graph', onClick: () => setVaultOpen(true) },
          { icon: <LuSettings />, label: 'Settings', onClick: () => setSettingsOpen(true) }
        ]}
      />
      <div className="body">
        <nav className="activity" ref={navRef}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={'act' + (view === v.id ? ' active' : '')}
              data-tip={v.label}
              aria-label={v.label}
              onClick={() => pickView(v.id)}
            >
              {v.icon}
            </button>
          ))}
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

        <Group
          key={`${view ? 1 : 0}-${terminalOnly ? 1 : 0}-${mode}-${problemsOpen ? 1 : 0}`}
          orientation="horizontal"
          className="group"
        >
          {view && (
            <>
              <Panel defaultSize={340} minSize={240} maxSize={640} className="pane sidebar">
                {view === 'files' && (
                  <>
                    <ViewHead title={project ? base(project) : 'Files'} />
                    {project ? (
                      <FileTree
                        root={project}
                        version={treeVersion}
                        active={active}
                        onOpen={openFile}
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
                {settings && view === 'agents' && <AgentsTab {...tabProps} />}
                {settings && view === 'activity' && <ActivityTab {...tabProps} />}
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
                />
              </div>
            ) : (
              <Group orientation="vertical" className="group">
                {!terminalOnly && (
                  <>
                    <Panel minSize={120} className="pane editor">
                      {project ? (
                        <Editor
                          files={files}
                          setFiles={setFiles}
                          active={active}
                          setActive={setActive}
                          problems={problemCount}
                          problemsOpen={problemsOpen}
                          onToggleProblems={toggleProblems}
                          onStatus={setEditorStatus}
                        />
                      ) : (
                        welcome
                      )}
                    </Panel>
                    <Separator className="sep" />
                  </>
                )}
                <Panel defaultSize={terminalOnly ? undefined : 240} minSize={120} className="main">
                  <Group orientation="horizontal" className="group">
                    <Panel minSize={240} className="pane terminals">
                      <TerminalPanel
                        cwd={project}
                        terms={terms}
                        onAdd={addTerm}
                        onClose={closeTerm}
                      />
                    </Panel>
                    {problemsOpen && settings && (
                      <>
                        <Separator className="sep" />
                        <Panel
                          defaultSize={320}
                          minSize={260}
                          maxSize={480}
                          className="problems-slot"
                          aria-label="Problems"
                        >
                          <section className="pane problems">
                            <ProblemsTab {...tabProps} onClose={toggleProblems} />
                          </section>
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
        editor={
          mode === 'ide' && !terminalOnly && active === editorStatus?.path ? editorStatus : null
        }
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
