import { defineConfig } from '@playwright/test';

const inCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: inCI,
  failOnFlakyTests: inCI,
  retries: inCI ? 1 : 0,
  reporter: inCI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['./e2e/support/ci-summary-reporter.cjs'],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-linux.png',
  projects: [
    {
      name: 'electron-smoke',
      testMatch: /\/(?:harness|smoke)\/.*\.spec\.ts/,
    },
    {
      name: 'electron-functional',
      testMatch: /\/journeys\/.*\.spec\.ts/,
    },
    {
      name: 'electron-visual-linux',
      testMatch: /\/visual\/.*\.spec\.ts/,
    },
  ],
});
