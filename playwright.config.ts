import { defineConfig, devices } from '@playwright/test';

// Browser-level drag verification (tasks 06 / 12). Chromium only — PRD §8.
const PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { trace: 'on-first-retry', baseURL: `http://localhost:${PORT}` },
  webServer: {
    // The examples consume the built `dist` (D4), so build it before serving.
    command: `npm run build -w @t-works/react-grid-engine && npm run dev -w standalone-basic -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
