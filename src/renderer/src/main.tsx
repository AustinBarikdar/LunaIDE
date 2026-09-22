import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import Popout from './Popout'

// A window opened with #popout=<view> shows just that view (see openPopout in the main process).
const view = new URLSearchParams(location.hash.slice(1)).get('popout')
createRoot(document.getElementById('root')!).render(view ? <Popout view={view} /> : <App />)
