import type { CommitDetail, Settings } from '../../../preload/index.d'

export type TabProps = {
  project: string | null
  settings: Settings
  saveSetting: (p: Partial<Settings>) => Promise<void>
  /** Open a file in the editor with a diff overlay (added lines green, removed lines red). */
  openDiff: (relPath: string, fileDiff: string) => void
  /** Launch an agent terminal in the current workspace. */
  launch: (agent: 'claude' | 'codex') => void
  /** Open a file in the editor and put the cursor at line/ch (0-based). */
  reveal: (path: string, line: number, ch: number) => void
  /** Open the team-prompt composer. */
  openTeam: () => void
  /** Open a terminal in the current workspace running a command (e.g. an interactive login). */
  openTerminal?: (name: string, cmd: string) => void
  /** Show a commit as its own editor tab, with the whole diff. */
  openCommit?: (commit: CommitDetail) => void
}
