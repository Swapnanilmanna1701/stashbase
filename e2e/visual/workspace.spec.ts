import { expect, test } from '@playwright/test';
import { fileTreeRow } from '../support/locators.ts';
import {
  dismissEmbeddingSetup,
  expectLinuxScreenshot,
  launchVisualApp,
  openFixtureFolder,
  setVisualViewport,
} from './visual-helpers.ts';

test('active-folder workspace shell keeps its redesigned composition', async ({}, testInfo) => {
  const visual = await launchVisualApp('one-folder', testInfo);
  try {
    const { page } = visual.app;
    await setVisualViewport(page, 1280, 820);
    await openFixtureFolder(page);
    await dismissEmbeddingSetup(page);

    await expect(page.getByRole('complementary', { name: 'Agent chat' }).getByRole('tab', { selected: true })).toBeInViewport();
    await expect(page.locator('aside.sidebar')).toBeVisible();
    await expect(page.locator('#sideHead')).toContainText('project-alpha');
    await expect(fileTreeRow(page, 'nested')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('status').filter({ hasText: 'Codex is not installed' })).toBeVisible();

    await expectLinuxScreenshot(page, 'workspace-folder.png');
  } finally {
    await visual.close();
  }
});

test('empty library keeps the redesigned zero-state composition', async ({}, testInfo) => {
  const visual = await launchVisualApp('empty', testInfo);
  try {
    const { page } = visual.app;
    await setVisualViewport(page, 1280, 820);

    await expect(page.getByRole('complementary', { name: 'Agent chat' }).getByRole('tab', { selected: true })).toBeInViewport();
    await expect(page.getByText('Add a folder to build your searchable library.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add folder to library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Codex is not installed' })).toBeVisible();

    await expectLinuxScreenshot(page, 'workspace-empty.png');
  } finally {
    await visual.close();
  }
});
