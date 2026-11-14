import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Design-system fonts, self-hosted (one file per weight; no synthesized bold)
import '@fontsource/epilogue/400.css'
import '@fontsource/epilogue/500.css'
import '@fontsource/epilogue/600.css'
import '@fontsource/epilogue/700.css'
import '@fontsource/syne/600.css'
import '@fontsource/syne/700.css'
import '@fontsource/syne/800.css'
import './index.css'
import App from './App.tsx'
import { initPwa } from './utils/pwa'
import { initNativeBridge } from './utils/nativeBridge'

initPwa()
initNativeBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
