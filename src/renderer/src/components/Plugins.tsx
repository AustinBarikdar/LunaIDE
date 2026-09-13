import { useEffect, useRef, useState } from 'react'
import { LuFolderOpen, LuPlus, LuTrash2, LuWand, LuDownload, LuRefreshCw } from 'react-icons/lu'
import { pluginManifestSchema, type PluginManifest, type Plugin } from '../../../shared/plugins'

type Page = 'installed' | 'create' | 'install'
type Preset = 'agent' | 'language' | 'python'
const starter = (preset: Preset): PluginManifest => ({
  name: preset === 'python' ? 'python-tools' : '',
  version: '0.1.0',
  description: preset === 'python' ? 'Python diagnostics and completion' : '',
  author: '',
  agents: preset === 'agent' ? [{ id: '', name: '', command: '' }] : [],
  languageServers:
    preset === 'agent'
      ? []
      : [
          {
            name: preset === 'python' ? 'Python' : '',
            command: preset === 'python' ? 'pyright-langserver' : '',
            args: ['--stdio'],
            exts: preset === 'python' ? ['py', 'pyi'] : []
          }
        ]
})

export default function Plugins(): React.JSX.Element {
  const [page, setPage] = useState<Page>('installed')
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [draft, setDraft] = useState<PluginManifest>(() => starter('agent'))
  const [url, setUrl] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [removeName, setRemoveName] = useState<string | null>(null)
  const refresh = async (): Promise<void> => setPlugins(await window.luna.plugins.list())
  useEffect(() => {
    const update = (): void => {
      refresh().catch((err) => {
        setMessage(String(err))
        setError(true)
      })
    }
    update()
    return window.luna.plugins.onChanged(update)
  }, [])
  const run = async (operation: () => Promise<string | void>): Promise<boolean> => {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      const result = await operation()
      setMessage(result || 'Updated plugins.')
      await refresh()
      return result !== 'Cancelled.'
    } catch (err) {
      setError(true)
      setMessage(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  const validation = pluginManifestSchema.safeParse(draft)
  const hasContributions = !!(draft.agents?.length || draft.languageServers?.length)
  const visible = plugins.filter((p) =>
    `${p.manifest.name} ${p.manifest.description ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <section className="plugin-manager">
      <h2>Plugins</h2>
      <p className="dim">
        Add agent launchers and language support. Create your own or install a shared plugin.
      </p>
      <div className="row plugin-navigation" aria-label="Plugin pages">
        {(['installed', 'create', 'install'] as const).map((id) => (
          <button
            key={id}
            className={page === id ? 'primary' : ''}
            aria-pressed={page === id}
            onClick={() => setPage(id)}
            disabled={busy}
          >
            {id === 'installed'
              ? `Installed (${plugins.length})`
              : id === 'create'
                ? 'Create plugin'
                : 'Install plugin'}
          </button>
        ))}
      </div>
      {message && (
        <div
          role={error ? 'alert' : 'status'}
          className={'plugin-message' + (error ? ' error' : '')}
        >
          {message}
        </div>
      )}
      {busy && (
        <p className="dim" role="status">
          Working…
        </p>
      )}
      {page === 'installed' && (
        <>
          <div className="row">
            <input
              aria-label="Search installed plugins"
              placeholder="Search plugins"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              title="Reload plugins after editing"
              aria-label="Reload plugins"
              disabled={busy}
              onClick={() => run(window.luna.plugins.refresh)}
            >
              <LuRefreshCw />
            </button>
            <button
              title="Open plugins folder"
              aria-label="Open plugins folder"
              onClick={() =>
                run(async () => {
                  const result = await window.luna.plugins.openDir()
                  if (result) throw new Error(result)
                })
              }
            >
              <LuFolderOpen />
            </button>
          </div>
          {!plugins.length && (
            <div className="plugin-card">
              <b>No plugins installed yet</b>
              <p className="dim">Start with an agent launcher or a language-server template.</p>
              <button onClick={() => setPage('create')}>
                <LuWand /> Create your first plugin
              </button>
            </div>
          )}
          {plugins.length > 0 && !visible.length && (
            <p className="dim">No plugins match your search.</p>
          )}
          {visible.map((plugin) => (
            <div className="plugin-card" key={plugin.dir}>
              <div className="row">
                <b>{plugin.manifest.name}</b>
                <span className="dim small">
                  {plugin.manifest.version && `v${plugin.manifest.version}`}
                </span>
                <span className="spacer" />
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={busy || !!plugin.error}
                    checked={plugin.enabled}
                    onChange={(e) =>
                      run(() => window.luna.plugins.toggle(plugin.manifest.name, e.target.checked))
                    }
                  />
                  {plugin.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              {plugin.error ? (
                <p className="plugin-message error">{plugin.error}</p>
              ) : (
                <>
                  <p className="dim">{plugin.manifest.description || 'No description'}</p>
                  <span className="dim small">
                    {plugin.manifest.agents?.length ?? 0} agents ·{' '}
                    {plugin.manifest.languageServers?.length ?? 0} language servers
                  </span>
                </>
              )}
              <div className="row plugin-actions">
                <button
                  className="small"
                  disabled={busy}
                  onClick={() => run(() => window.luna.plugins.reveal(plugin.manifest.name))}
                >
                  <LuFolderOpen /> Files
                </button>
                <button
                  className="small"
                  disabled={busy}
                  onClick={() => run(() => window.luna.plugins.export(plugin.manifest.name))}
                >
                  <LuDownload /> Export
                </button>
                <span className="spacer" />
                <button
                  className="small"
                  disabled={busy}
                  onClick={() => setRemoveName(plugin.manifest.name)}
                >
                  <LuTrash2 /> Remove
                </button>
              </div>
              {removeName === plugin.manifest.name && (
                <div className="plugin-message">
                  <p>
                    Delete this plugin’s installed files? Export first if you want to keep your
                    edits.
                  </p>
                  <div className="row">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (await run(() => window.luna.plugins.remove(plugin.manifest.name)))
                          setRemoveName(null)
                      }}
                    >
                      Delete plugin
                    </button>
                    <button disabled={busy} onClick={() => setRemoveName(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {page === 'install' && (
        <div className="plugin-card">
          <b>Install a shared plugin</b>
          <p className="dim">
            Choose a plugin folder or paste its Git repository URL. The plugin’s commands must
            already be installed. Enabled language servers start automatically.
          </p>
          <button disabled={busy} onClick={() => run(window.luna.plugins.installFolder)}>
            <LuFolderOpen /> Choose plugin folder
          </button>
          <form
            className="plugin-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (url.trim() && (await run(() => window.luna.plugins.installGit(url.trim())))) {
                setUrl('')
                setPage('installed')
              }
            }}
          >
            <label>
              Git repository URL
              <input
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/you/your-plugin"
                disabled={busy}
              />
            </label>
            <button disabled={busy || !url.trim()} type="submit">
              Install from Git
            </button>
          </form>
        </div>
      )}
      {page === 'create' && (
        <form
          className="plugin-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              validation.success &&
              hasContributions &&
              (await run(() => window.luna.plugins.create(validation.data)))
            ) {
              setPage('installed')
              setDraft(starter('agent'))
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Start from a template
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) setDraft(starter(e.target.value as Preset))
                  e.target.value = ''
                }}
              >
                <option value="" disabled>
                  Choose a template (replaces this draft)
                </option>
                <option value="agent">CLI agent</option>
                <option value="language">Language server</option>
                <option value="python">Python / Pyright</option>
              </select>
            </label>
            <label>
              Plugin name
              <input
                required
                placeholder="my-plugin"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="plugin-fields">
              <label>
                Version
                <input
                  required
                  value={draft.version ?? ''}
                  onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                />
              </label>
              <label>
                Author (optional)
                <input
                  value={draft.author ?? ''}
                  onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                />
              </label>
            </div>
            <label>
              Description
              <input
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            {draft.agents?.map((agent, i) => (
              <div className="plugin-card" key={i}>
                <div className="row">
                  <b>Agent launcher</b>
                  <span className="spacer" />
                  <button
                    type="button"
                    title="Remove agent"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        agents: draft.agents?.filter((_, index) => index !== i)
                      })
                    }
                  >
                    <LuTrash2 />
                  </button>
                </div>
                {(['id', 'name', 'command'] as const).map((key) => (
                  <label key={key}>
                    {key === 'id' ? 'Agent ID' : key === 'name' ? 'Display name' : 'Launch command'}
                    <input
                      required
                      placeholder={
                        key === 'id'
                          ? 'my-agent'
                          : key === 'name'
                            ? 'My Agent'
                            : 'my-agent --interactive'
                      }
                      value={agent[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agents: draft.agents?.map((item, index) =>
                            index === i ? { ...item, [key]: e.target.value } : item
                          )
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ))}
            {draft.languageServers?.map((server, i) => (
              <div className="plugin-card" key={i}>
                <div className="row">
                  <b>Language server</b>
                  <span className="spacer" />
                  <button
                    type="button"
                    title="Remove language server"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        languageServers: draft.languageServers?.filter((_, index) => index !== i)
                      })
                    }
                  >
                    <LuTrash2 />
                  </button>
                </div>
                {(['name', 'command'] as const).map((key) => (
                  <label key={key}>
                    {key === 'name' ? 'Display name' : 'Server command'}
                    <input
                      required
                      value={server[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          languageServers: draft.languageServers?.map((item, index) =>
                            index === i ? { ...item, [key]: e.target.value } : item
                          )
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Arguments (one per line)
                  <textarea
                    rows={2}
                    value={(server.args ?? []).join('\n')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        languageServers: draft.languageServers?.map((item, index) =>
                          index === i
                            ? { ...item, args: e.target.value ? e.target.value.split('\n') : [] }
                            : item
                        )
                      })
                    }
                  />
                </label>
                <label>
                  File extensions (separated by commas)
                  <input
                    required
                    placeholder="py, pyi"
                    value={server.exts.join(',')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        languageServers: draft.languageServers?.map((item, index) =>
                          index === i ? { ...item, exts: e.target.value.split(',') } : item
                        )
                      })
                    }
                  />
                </label>
              </div>
            ))}
            <div className="row plugin-actions">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    agents: [...(draft.agents ?? []), { id: '', name: '', command: '' }]
                  })
                }
              >
                <LuPlus /> Agent
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    languageServers: [
                      ...(draft.languageServers ?? []),
                      { name: '', command: '', args: ['--stdio'], exts: [] }
                    ]
                  })
                }
              >
                <LuPlus /> Language server
              </button>
            </div>
            <p className="dim small">
              Commands must be installed and available in your terminal. Creating the plugin enables
              its language servers immediately.
            </p>
            {!validation.success && (
              <ul className="plugin-validation">
                {validation.error.issues.map((issue, i) => (
                  <li key={i}>
                    {issue.path.join(' → ')}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {!hasContributions && (
              <p className="plugin-message">Add at least one agent or language server.</p>
            )}
            <details>
              <summary>Preview plugin file</summary>
              <pre className="console">
                {JSON.stringify(validation.success ? validation.data : draft, null, 2)}
              </pre>
            </details>
            <button
              className="primary"
              type="submit"
              disabled={!validation.success || !hasContributions}
            >
              <LuWand /> Create and enable
            </button>
          </fieldset>
        </form>
      )}
    </section>
  )
}
