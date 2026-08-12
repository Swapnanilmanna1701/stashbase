import fs from 'node:fs';
import path from 'node:path';
import { expect, type TestInfo } from '@playwright/test';
import type { Page } from 'playwright';
import { assertPortAvailable, launchApp, type LaunchedApp } from '../support/app.ts';
import { createAppFixture, type AppFixture, type FixtureMembership } from '../support/fixtures.ts';
import { dismissEmbeddingKeyPrompt, fileTreeRow } from '../support/locators.ts';

export interface VisualApp {
  app: LaunchedApp;
  fixture: AppFixture;
  close(): Promise<void>;
}

export async function launchVisualApp(
  membership: FixtureMembership,
  testInfo: TestInfo,
): Promise<VisualApp> {
  const fixture = await createAppFixture({ membership });
  makeAgentDiscoveryDeterministic(fixture);
  if (process.platform === 'linux') fixture.env.STASHBASE_E2E_DEVICE_SCALE_FACTOR = '1';
  const app = await launchApp(fixture, testInfo);
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  if (process.platform === 'linux') {
    await expect.poll(() => app.page.evaluate(() => window.devicePixelRatio)).toBe(1);
  }

  let closed = false;
  return {
    app,
    fixture,
    async close() {
      if (closed) return;
      closed = true;
      try {
        app.errors.assertNone();
      } finally {
        await app.close();
        await assertPortAvailable(fixture.port);
        await fixture.cleanup();
      }
    },
  };
}

export async function setVisualViewport(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
}

export async function openFixtureFolder(page: Page, folderName = 'project-alpha'): Promise<void> {
  await page.getByRole('button', { name: folderName, exact: true }).click();
  await expect(page).toHaveTitle(`${folderName} — StashBase`);
  await expect(fileTreeRow(page, 'Welcome.md')).toBeVisible();
}

export async function dismissEmbeddingSetup(page: Page): Promise<void> {
  await dismissEmbeddingKeyPrompt(page);
}

export async function openFixtureFile(page: Page, relativePath: string): Promise<void> {
  const directRow = fileTreeRow(page, relativePath);
  await directRow.click();
  await expect(page.getByRole('tab', { name: new RegExp(escapeRegExp(path.basename(relativePath))) })).toHaveAttribute('aria-selected', 'true');
  await expect(directRow).toHaveAttribute('data-path', relativePath);
}

export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await openSettings(page);
  await page.getByRole('group', { name: 'Theme' }).getByText(theme === 'light' ? 'Light' : 'Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();
}

export async function expectLinuxScreenshot(page: Page, name: string): Promise<void> {
  if (process.platform !== 'linux') return;
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
  });
}

function makeAgentDiscoveryDeterministic(fixture: AppFixture): void {
  if (process.platform === 'win32') return;
  const unavailableShell = path.join(fixture.root, 'agent-unavailable-shell');
  const testBin = path.join(fixture.root, 'test-bin');
  fs.mkdirSync(testBin, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(testBin, 'node'));
  fs.writeFileSync(unavailableShell, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  fixture.env.SHELL = unavailableShell;
  fixture.env.PATH = [testBin, '/usr/bin', '/bin'].join(path.delimiter);
  fixture.env.STASHBASE_CODEX_BIN = path.join(fixture.root, 'missing-codex');
  fixture.env.STASHBASE_CLAUDE_BIN = path.join(fixture.root, 'missing-claude');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
