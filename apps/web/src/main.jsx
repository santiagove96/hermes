import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import './index.css'
import App from './App.jsx'
import SentryFallback from './components/SentryFallback.jsx'
import './lib/supabase'
import AuthProvider from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ReadingSizeProvider } from './contexts/ReadingSizeContext'
import { ThemeProvider } from './contexts/ThemeContext'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
})

if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.ProseMirror',
    },
    respect_dnt: true,
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <BrowserRouter>
        <LanguageProvider>
          <ThemeProvider>
            <ReadingSizeProvider>
              <AuthProvider>
                  <App />
              </AuthProvider>
            </ReadingSizeProvider>
          </ThemeProvider>
        </LanguageProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
