// Polyfills must be imported first!
import './polyfills.js'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const basename = import.meta.env.BASE_URL

// Handle SPA redirect from 404.html (GitHub Pages workaround)
// Must happen before React Router initializes
const spaRedirect = sessionStorage.getItem('spa-redirect')
if (spaRedirect) {
  sessionStorage.removeItem('spa-redirect')
  // Remove the base path prefix if present
  let redirectPath = spaRedirect
  if (redirectPath.startsWith(basename)) {
    redirectPath = redirectPath.slice(basename.length) || '/'
  }
  // Navigate to the correct URL
  window.history.replaceState(null, '', basename + redirectPath)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
