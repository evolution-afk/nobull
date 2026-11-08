import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getTelegramWebApp } from './utils/telegram'
import './index.css'
import App from './App.tsx'

getTelegramWebApp()?.ready?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
