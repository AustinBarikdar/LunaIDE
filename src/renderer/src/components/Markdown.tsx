import { marked } from 'marked'
import { parseDiff, splitByFile } from './diff'
import { LuFileDiff } from 'react-icons/lu'

type OnOpen = (relPath: string, fileDiff: string) => void

export function DiffView({ diff, onOpen }: { diff: string; onOpen?: OnOpen }): React.JSX.Element {
  const lines = parseDiff(diff)
  const files = splitByFile(diff)
  const adds = lines.filter((l) => l.kind === 'add').length
  const dels = lines.filter((l) => l.kind === 'del').length
  return (
    <div className="diff">
      <div className="diff-stats">
        <span className="badge ok">+{adds}</span>
        <span className="badge err">−{dels}</span>
      </div>
      {lines.map((l, i) =>
        l.kind === 'meta' ? null : l.kind === 'file' ? (
          <div
            key={i}
            className={'dl file' + (onOpen ? ' clickable' : '')}
            title={onOpen ? 'Open in editor with highlights' : undefined}
            onClick={() => {
              const f = files.find((x) => x.path === l.text)
              if (onOpen && f) onOpen(f.path, f.diff)
            }}
          >
            <LuFileDiff /> {l.text}
          </div>
        ) : (
          <div key={i} className={'dl ' + l.kind}>
            {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : ''}
            {l.text || ' '}
          </div>
        )
      )}
    </div>
  )
}

/** Markdown body with ```diff fences rendered as coloured bubbles. */
export default function Markdown({
  text,
  onOpen
}: {
  text: string
  onOpen?: OnOpen
}): React.JSX.Element {
  const parts = text.split(/(```diff\n[\s\S]*?\n```)/g)
  return (
    <div className="md">
      {parts.map((part, i) =>
        part.startsWith('```diff\n') ? (
          <DiffView key={i} diff={part.slice(8, -4)} onOpen={onOpen} />
        ) : part.trim() ? (
          // ponytail: agents are local and CSP blocks inline scripts; no sanitizer until content comes from elsewhere
          <div
            key={i}
            dangerouslySetInnerHTML={{ __html: marked.parse(part, { async: false }) as string }}
          />
        ) : null
      )}
    </div>
  )
}
