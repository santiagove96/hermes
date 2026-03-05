import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import './lib/supabase'
import { initAnalytics } from './lib/analytics'
import AuthProvider from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ReadingSizeProvider } from './contexts/ReadingSizeContext'
import { ThemeProvider } from './contexts/ThemeContext'

function scheduleIdle(task) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 2000 });
    return;
  }
  window.setTimeout(task, 800);
}

if (import.meta.env.PROD) {
  scheduleIdle(async () => {
    if (import.meta.env.VITE_SENTRY_DSN) {
      const Sentry = await import('@sentry/react');
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        enabled: true,
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
      });
    }

    await initAnalytics({
      key: import.meta.env.VITE_POSTHOG_KEY,
      apiHost: import.meta.env.VITE_POSTHOG_HOST,
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
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
  </StrictMode>,
)
