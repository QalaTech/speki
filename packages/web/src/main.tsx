import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryProvider } from './app/providers/query'
import { ErrorProvider } from './components/ui/ErrorContext'
import './index.css'
import App from './App.tsx'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ErrorProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorProvider>
    </QueryProvider>
  </StrictMode>,
)
