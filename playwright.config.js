import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1508, height: 1200 },
  },
  webServer: {
    command: 'npm run dev -w @hermes/web -- --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
