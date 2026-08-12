import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /failed-assertion\.probe\.ts/,
  outputDir: process.env.STASHBASE_E2E_PROBE_OUTPUT ?? 'test-results/e2e-probe',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['line']],
  projects: [{ name: 'electron-diagnostic-probe' }],
});
