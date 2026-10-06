import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { createAppBootstrap } from './app/bootstrap'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element "#root" was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App bootstrap={createAppBootstrap(import.meta.env)} />
  </StrictMode>,
)
