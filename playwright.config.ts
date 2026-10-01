import { defineConfig, devices } from '@playwright/test';

// Browser-level verification (tasks 06 / 12). Chromium only — PRD §8.
// `standalone-basic` (5173) is the fixture for drag/tab-menu; the dashboard
// (5174) hosts the event demo (task 11).
const BASIC_PORT = 5173;
const DASHBOARD_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { trace: 'on-first-retry', baseURL: `http://localhost:${BASIC_PORT}` },
  webServer: [
    {
      // The examples consume the built `dist` (D4), so build it before serving.
      // Both servers must be ready before tests run, so this also gates the
      // dashboard server below on a fresh `dist`.
      command: `npm run build -w @t-works/react-grid-engine && npm run dev -w standalone-basic -- --port ${BASIC_PORT} --strictPort`,
      url: `http://localhost:${BASIC_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run dev -w standalone-dashboard -- --port ${DASHBOARD_PORT} --strictPort`,
      url: `http://localhost:${DASHBOARD_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
