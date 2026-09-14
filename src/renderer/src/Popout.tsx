import { useEffect, useState } from 'react'
import type { Settings } from '../../preload/index.d'
import FileTree from './components/FileTree'
import GitTab from './tabs/GitTab'
import SummariesTab from './tabs/SummariesTab'
import AgentsTab from './tabs/AgentsTab'
import ActivityTab from './tabs/ActivityTab'
import ProblemsTab from './tabs/ProblemsTab'
import { applyTheme } from './components/theme'
import { updateDiagnostics, viewFor } from './components/lspExtensions'
import { EmptyState, ViewHead } from './components/ui'
import { LuFolder } from 'react-icons/lu'
import type { TabProps } from './tabs/types'

/** Files is a tree, not a tab component, so it gets a tiny wrapper. */
function FilesPane({ project, openDiff }: TabProps): React.JSX.Element {
  const [version, setVersion] = useState(0)
  useEffect(() => window.luna.onFileChanged(() => setVersion((v) => v + 1)), [])
  if (!project)
    return (
      <EmptyState icon={<LuFolder />} title="No project" text="Open a folder in the main window." />
    )
  return (
    <>
      <ViewHead title={project.split('/').filter(Boolean).pop() ?? 'Files'} />
      <FileTree root={project} version={version} active={null} onOpen={(p) => openDiff(p, '')} />
    </>
  )
}

const PANES: Record<string, (p: TabProps) => React.JSX.Element> = {
  files: FilesPane,
  git: GitTab,
  summaries: SummariesTab,
  agents: AgentsTab,
  activity: ActivityTab,
  problems: ProblemsTab
}

/**
 * One view in its own window. It talks to the same main process, so everything stays live;
 * anything that needs the editor (opening a file, a diff) is handed back to the main window.
 */
export default function Popout({ view }: { view: string }): React.JSX.Element {
  const [project, setProject] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    window.luna.currentProject().then((p) => setProject(p || null))
    window.luna.settings.get().then(setSettings)
  }, [])
  const theme = settings?.theme ?? 'system'
  useEffect(() => applyTheme(theme), [theme])
  // the editor lives in the main window, so a torn-off Problems view listens for itself
  useEffect(
    () =>
      window.luna.lsp.onDiagnostics((path, source, diagnostics) =>
        updateDiagnostics(path, source, diagnostics, viewFor(path))
      ),
    []
  )

  const Pane: ((p: TabProps) => React.JSX.Element) | undefined = PANES[view]
  if (!Pane) return <div className="pane sidebar popout-pane">Unknown view: {view}</div>
  if (!settings) return <div className="pane sidebar popout-pane" />
  const props: TabProps = {
    project,
    settings,
    saveSetting: async (patch) => setSettings(await window.luna.settings.save(patch)),
    openDiff: (rel, diff) => window.luna.popout.reveal(rel, diff),
    reveal: (path) => window.luna.popout.reveal(path),
    launch: () => window.luna.popout.reveal(''),
    openTeam: () => {}
  }
  return (
    <div className="pane sidebar popout-pane">
      <Pane {...props} />
    </div>
  )
}
