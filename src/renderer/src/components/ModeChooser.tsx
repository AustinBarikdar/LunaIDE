import { useState } from 'react'
import { LuLayoutGrid, LuCode, LuMoon } from 'react-icons/lu'

export type Mode = 'agent' | 'ide'

export default function ModeChooser({
  onPick
}: {
  onPick: (mode: Mode, remember: boolean) => void
}): React.JSX.Element {
  const [remember, setRemember] = useState(false)
  return (
    <div className="chooser">
      <div className="chooser-card">
        <div className="brand big">
          <span className="brand-mark">
            <LuMoon />
          </span>
          Luna
        </div>
        <div className="dim">How do you want to work today?</div>
        <div className="chooser-options">
          <button className="option" onClick={() => onPick('agent', remember)}>
            <span className="option-icon">
              <LuLayoutGrid />
            </span>
            <b>Agent view</b>
            <span className="dim small">
              Terminals docked side by side, grouped into workspaces like Frontend or Backend. No
              editor.
            </span>
          </button>
          <button className="option" onClick={() => onPick('ide', remember)}>
            <span className="option-icon">
              <LuCode />
            </span>
            <b>IDE view</b>
            <span className="dim small">
              Files, editor with diff highlights, and terminals below. The full workbench.
            </span>
          </button>
        </div>
        <label className="remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />{' '}
          Remember my choice (you can switch in the titlebar)
        </label>
      </div>
    </div>
  )
}
