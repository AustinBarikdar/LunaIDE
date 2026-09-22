import { useEffect, useState } from 'react'
import Plugins from './Plugins'
import {
  LuFolderOpen,
  LuX,
  LuDatabase,
  LuServer,
  LuSparkles,
  LuPuzzle,
  LuPlus,
  LuTrash2,
  LuBot,
  LuCheck,
  LuPalette,
  LuSun,
  LuMoon,
  LuMonitor
} from 'react-icons/lu'
import type { Settings, ServerConfig, AgentName, Preview } from '../../../preload/index.d'
import { Avatar } from './ui'

type Props = {
  settings: Settings
  save: (p: Partial<Settings>) => Promise<void>
  onClose: () => void
  initialTab?: SettingsTab
}
export type SettingsTab = 'appearance' | 'vault' | 'hub' | 'rollup' | 'extensions' | 'agents'

const THEMES = [
  { id: 'light' as const, label: 'Light', icon: <LuSun /> },
  { id: 'dark' as const, label: 'Dark', icon: <LuMoon /> },
  { id: 'system' as const, label: 'System', icon: <LuMonitor /> }
]

export default function SettingsModal({
  settings,
  save,
  onClose,
  initialTab = 'vault'
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <aside className="modal-nav">
          <div className="modal-title">Settings</div>
          <button
            className={'nav-item' + (tab === 'appearance' ? ' on' : '')}
            onClick={() => setTab('appearance')}
          >
            <LuPalette /> Appearance
          </button>
          <button
            className={'nav-item' + (tab === 'vault' ? ' on' : '')}
            onClick={() => setTab('vault')}
          >
            <LuDatabase /> Memory vault
          </button>
          <button
            className={'nav-item' + (tab === 'hub' ? ' on' : '')}
            onClick={() => setTab('hub')}
          >
            <LuServer /> MCP hub
          </button>
          <button
            className={'nav-item' + (tab === 'agents' ? ' on' : '')}
            onClick={() => setTab('agents')}
          >
            <LuBot /> Agents
          </button>
          <button
            className={'nav-item' + (tab === 'rollup' ? ' on' : '')}
            onClick={() => setTab('rollup')}
          >
            <LuSparkles /> Roll-up
          </button>
          <button
            className={'nav-item' + (tab === 'extensions' ? ' on' : '')}
            onClick={() => setTab('extensions')}
          >
            <LuPuzzle /> Extensions
          </button>
        </aside>
        <section className="modal-body">
          <button className="icon ghost modal-close" onClick={onClose} title="Close (Esc)">
            <LuX />
          </button>
          {tab === 'appearance' && (
            <>
              <h2>Appearance</h2>
              <p className="dim">
                Light, dark, or whatever the system is set to. It changes the editor and the
                terminals with it.
              </p>
              <div className="theme-picker">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={'theme-card' + (settings.theme === t.id ? ' on' : '')}
                    onClick={() => save({ theme: t.id })}
                  >
                    <span className={'theme-swatch ' + t.id} />
                    {t.icon} {t.label}
                    {settings.theme === t.id && <LuCheck className="accent" />}
                  </button>
                ))}
              </div>
              <h2 style={{ marginTop: 18 }}>Editor</h2>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.autosave}
                  onChange={(e) => save({ autosave: e.target.checked })}
                />
                Autosave: write a file on its own about a second after typing stops
              </label>
              <p className="dim">
                Off, a changed tab shows a dot and asks before it closes. ⌘S saves one file, ⌘⇧S
                saves them all.
              </p>
            </>
          )}
          {tab === 'vault' && (
            <>
              <h2>Memory vault</h2>
              <p className="dim">
                Agents write summaries, inbox messages, and notes here as markdown. Point it at your
                Obsidian vault to get graph and search for free.
              </p>
              <label>
                Vault folder
                <div className="row">
                  <input
                    value={settings.vaultPath}
                    placeholder="<project>/.luna/vault"
                    onChange={(e) => save({ vaultPath: e.target.value })}
                  />
                  <button
                    onClick={() =>
                      window.luna.pickDir().then((d) => {
                        if (d) save({ vaultPath: d })
                      })
                    }
                  >
                    <LuFolderOpen /> Browse
                  </button>
                </div>
              </label>
              <p className="dim small">
                Luna writes to &lt;vault&gt;/Luna/&lt;project name&gt;/. Leave blank to keep it
                inside each project.
              </p>
            </>
          )}
          {tab === 'hub' && (
            <>
              <h2>MCP hub</h2>
              <p className="dim">
                The local server your agents connect to. Changing the port restarts it; re-register
                agents afterwards.
              </p>
              <label>
                Port
                <input
                  type="number"
                  style={{ width: 140 }}
                  value={settings.hubPort}
                  onChange={(e) => save({ hubPort: Number(e.target.value) || 4141 })}
                />
              </label>
              <p className="dim small mono">
                http://127.0.0.1:{settings.hubPort}/mcp/&lt;agent&gt;
              </p>
            </>
          )}
          {tab === 'agents' && <Agents />}
          {tab === 'extensions' && <Extensions settings={settings} save={save} />}
          {tab === 'rollup' && (
            <>
              <h2>Roll-up summarizer</h2>
              <p className="dim">
                Which CLI writes the roll-up of all agent summaries. It runs headless with MCP
                disabled, so it never loops back into the hub.
              </p>
              <label>
                CLI
                <select
                  style={{ width: 200 }}
                  value={settings.summarizer}
                  onChange={(e) => save({ summarizer: e.target.value as 'claude' | 'codex' })}
                >
                  <option value="claude">Claude Code</option>
                  <option value="codex">Codex</option>
                </select>
              </label>
              <label>
                Model <span className="dim">(blank = CLI default; e.g. sonnet, opus, gpt-5.5)</span>
                <input
                  style={{ width: 260 }}
                  value={settings.summarizerModel}
                  onChange={(e) => save({ summarizerModel: e.target.value })}
                />
              </label>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Extensions({
  settings,
  save
}: {
  settings: Settings
  save: (p: Partial<Settings>) => Promise<void>
}): React.JSX.Element {
  const list = settings.languageServers
  const [draft, setDraft] = useState({ name: '', command: '', args: '--stdio', exts: '' })
  const update = (next: ServerConfig[]): Promise<void> => save({ languageServers: next })
  const add = (): void => {
    if (!draft.name.trim() || !draft.command.trim() || !draft.exts.trim()) return
    update([
      ...list,
      {
        id: 'custom-' + Date.now(),
        name: draft.name.trim(),
        enabled: true,
        kind: 'lsp',
        command: draft.command.trim(),
        args: draft.args.split(/\s+/).filter(Boolean),
        exts: draft.exts
          .split(/[\s,]+/)
          .map((e) => e.replace(/^\./, '').toLowerCase())
          .filter(Boolean)
      }
    ])
    setDraft({ name: '', command: '', args: '--stdio', exts: '' })
  }
  return (
    <>
      <Plugins />
      <h2 style={{ marginTop: 8 }}>Language servers</h2>
      <p className="dim">
        Luna speaks the Language Server Protocol, the same thing most VS Code language extensions
        wrap. Bundled servers need nothing installed; add any other language server by command
        (pyright, rust-analyzer, gopls…).
      </p>
      <div className="list">
        {list.map((srv) => (
          <div key={srv.id} className="list-row">
            <label className="check" style={{ padding: '2px 8px' }}>
              <input
                type="checkbox"
                checked={srv.enabled}
                onChange={(e) =>
                  update(
                    list.map((x) => (x.id === srv.id ? { ...x, enabled: e.target.checked } : x))
                  )
                }
              />
              {srv.name}
            </label>
            <span className="dim small mono">
              {srv.builtin
                ? 'bundled'
                : srv.kind === 'eslint'
                  ? 'project eslint'
                  : `${srv.command} ${(srv.args ?? []).join(' ')}`}
            </span>
            <span className="spacer" />
            <span className="dim small">.{srv.exts.join(' .')}</span>
            {!srv.builtin && srv.kind !== 'eslint' && (
              <button
                className="icon small ghost"
                title="Remove"
                onClick={() => update(list.filter((x) => x.id !== srv.id))}
              >
                <LuTrash2 />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="section">
        <div className="section-title">Add a language server</div>
        <div className="row">
          <input
            placeholder="Name (e.g. Python)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            placeholder="Command (e.g. pyright-langserver)"
            value={draft.command}
            onChange={(e) => setDraft({ ...draft, command: e.target.value })}
          />
        </div>
        <div className="row">
          <input
            placeholder="Args"
            value={draft.args}
            onChange={(e) => setDraft({ ...draft, args: e.target.value })}
          />
          <input
            placeholder="Extensions (py, pyi)"
            value={draft.exts}
            onChange={(e) => setDraft({ ...draft, exts: e.target.value })}
          />
          <button
            className="primary"
            onClick={add}
            disabled={!draft.name || !draft.command || !draft.exts}
          >
            <LuPlus /> Add
          </button>
        </div>
        <p className="dim small">
          The command runs through your login shell, so anything on your PATH works. Servers restart
          when you change this list.
        </p>
      </div>
    </>
  )
}

const AGENT_NAMES: Record<AgentName, string> = { claude: 'Claude Code', codex: 'Codex' }

function AgentSetup({ agent }: { agent: AgentName }): React.JSX.Element {
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [outdated, setOutdated] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState('')
  const refresh = (): void => {
    window.luna.agents.status(agent).then((s) => {
      setRegistered(s.registered)
      setOutdated(!!s.outdated)
    })
  }
  useEffect(refresh, [agent])
  return (
    <div className="card">
      <div className="card-head">
        <Avatar name={agent} size={26} />
        <b>{AGENT_NAMES[agent]}</b>
        <span className={'chip ' + (registered ? 'ok' : registered === false ? 'warn' : '')}>
          <i />{' '}
          {registered === null
            ? 'checking…'
            : registered
              ? 'connected to the hub'
              : 'not registered'}
        </span>
        <span className="spacer" />
        {preview ? (
          <>
            <button className="small" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button
              className="primary small"
              onClick={() =>
                window.luna.agents.register(agent).then((r) => {
                  setResult(r)
                  setPreview(null)
                  refresh()
                })
              }
            >
              <LuCheck /> Confirm
            </button>
          </>
        ) : (
          <button
            className={registered ? 'small' : 'primary small'}
            onClick={() => window.luna.agents.preview(agent).then(setPreview)}
          >
            {registered ? 'Re-register' : outdated ? 'Update' : 'Register'}
          </button>
        )}
      </div>
      <p className="dim small" style={{ margin: '4px 0 0' }}>
        {agent === 'claude'
          ? 'Writes .mcp.json in the project and an inbox hook in .claude/settings.local.json. Approve the "luna" server once when Claude starts.'
          : 'Runs codex mcp add and adds the identity header to ~/.codex/config.toml.'}
      </p>
      {preview && (
        <div className="section" style={{ marginTop: 8 }}>
          <div className="dim small">Luna will make these changes:</div>
          {preview.map((p) => (
            <div key={p.title}>
              <div className="section-title">{p.title}</div>
              <pre className="console">{p.body}</pre>
            </div>
          ))}
        </div>
      )}
      {result && <div className="note">{result}</div>}
    </div>
  )
}

function Agents(): React.JSX.Element {
  return (
    <>
      <h2>Agents</h2>
      <p className="dim">
        Connect each CLI to Luna&apos;s hub once. Every terminal you launch gets its own identity
        (claude, claude-2, codex…) through the LUNA_AGENT variable, so the team prompt can give two
        Claude terminals different roles.
      </p>
      <AgentSetup agent="claude" />
      <AgentSetup agent="codex" />
    </>
  )
}
