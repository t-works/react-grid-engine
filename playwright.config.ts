import { defineConfig, devices } from '@playwright/test';

// Browser-level drag verification (task 12). Chromium only — PRD §8.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
