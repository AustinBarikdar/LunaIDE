import type { Settings } from '../../../preload/index.d'
import { live } from './termStore'

export type Theme = Settings['theme']

const DARK = {
  background: 'rgba(0,0,0,0)',
  foreground: '#e6e6f0',
  cursor: '#a595ff',
  selectionBackground: 'rgba(139,124,246,0.35)',
  black: '#1b1b24',
  red: '#ff6b6b',
  green: '#5ddc86',
  yellow: '#e3b341',
  blue: '#7aa2f7',
  magenta: '#c792ea',
  cyan: '#56d4dd',
  white: '#d7d7e0',
  brightBlack: '#6f6f7a',
  brightRed: '#ff8787',
  brightGreen: '#7ee09b',
  brightYellow: '#f2c55c',
  brightBlue: '#9ab8ff',
  brightMagenta: '#dbb0ff',
  brightCyan: '#7ae5ec',
  brightWhite: '#ffffff'
}

const LIGHT = {
  background: 'rgba(0,0,0,0)',
  foreground: '#1f1f24',
  cursor: '#6c5ce7',
  selectionBackground: 'rgba(108,92,231,0.25)',
  black: '#1f1f24',
  red: '#c62828',
  green: '#2e7d32',
  yellow: '#9a6700',
  blue: '#1a56db',
  magenta: '#8e24aa',
  cyan: '#00838f',
  white: '#8a8a94',
  brightBlack: '#6f6f7a',
  brightRed: '#d64545',
  brightGreen: '#3a9a4a',
  brightYellow: '#b58100',
  brightBlue: '#3b6fe0',
  brightMagenta: '#a64bc2',
  brightCyan: '#0aa0b0',
  brightWhite: '#1f1f24'
}

const query = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

/** What 'system' currently means. */
export const resolve = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (query().matches ? 'dark' : 'light') : theme

export const isDark = (): boolean => document.documentElement.dataset.theme === 'dark'

/** Terminal palette for the theme in effect right now. */
export const termTheme = (): typeof LIGHT => (isDark() ? DARK : LIGHT)

/** Paint the whole app, live terminals included. Returns an unsubscribe for 'system'. */
export function applyTheme(theme: Theme): () => void {
  const paint = (): void => {
    document.documentElement.dataset.theme = resolve(theme)
    for (const rec of live.values()) rec.term.options.theme = termTheme()
  }
  paint()
  if (theme !== 'system') return () => {}
  const mq = query()
  mq.addEventListener('change', paint)
  return () => mq.removeEventListener('change', paint)
}
