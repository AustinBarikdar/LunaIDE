export type Command = {
  id: string
  label: string
  keywords?: string
  shortcut?: string
  enabled?: boolean
  run: () => void | Promise<void>
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/)
  return commands.filter((command) =>
    words.every((word) => `${command.label} ${command.keywords ?? ''}`.toLowerCase().includes(word))
  )
}

export function shortcutCommand(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'isComposing'>
): string | undefined {
  if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'p') return event.shiftKey ? 'search.commands' : 'search.files'
  if (key === 'f' && event.shiftKey) return 'search.text'
  if (event.shiftKey) return
  return { s: 'file.save', b: 'view.sidebar', j: 'view.terminal', ',': 'settings.open' }[key]
}

export const modifierLabel = (): string =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

export function languageName(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return (
    (
      {
        js: 'JavaScript',
        jsx: 'JavaScript JSX',
        mjs: 'JavaScript',
        cjs: 'JavaScript',
        ts: 'TypeScript',
        tsx: 'TypeScript JSX',
        mts: 'TypeScript',
        json: 'JSON',
        md: 'Markdown',
        markdown: 'Markdown',
        css: 'CSS',
        scss: 'SCSS',
        less: 'Less',
        html: 'HTML',
        htm: 'HTML',
        py: 'Python',
        pyi: 'Python',
        rs: 'Rust',
        go: 'Go',
        sh: 'Shell',
        yaml: 'YAML',
        yml: 'YAML'
      } as Record<string, string>
    )[ext] ?? 'Plain Text'
  )
}

export type EditorStatus = { path: string; line: number; column: number; language: string }
