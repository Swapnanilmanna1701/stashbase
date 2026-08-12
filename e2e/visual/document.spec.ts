import { expect, test } from '@playwright/test';
import { activeDocument } from '../support/locators.ts';
import {
  dismissEmbeddingSetup,
  expectLinuxScreenshot,
  launchVisualApp,
  openFixtureFile,
  openFixtureFolder,
  setTheme,
  setVisualViewport,
} from './visual-helpers.ts';

test('Markdown reading, writing, and valid JSON keep distinct document surfaces', async ({}, testInfo) => {
  const visual = await launchVisualApp('one-folder', testInfo);
  try {
    const { page } = visual.app;
    await setVisualViewport(page, 1440, 900);
    await openFixtureFolder(page);
    await dismissEmbeddingSetup(page);

    await openFixtureFile(page, 'Welcome.md');
    const markdown = activeDocument(page);
    const readingToggle = page.getByRole('button', { name: 'Switch to Reading View' });
    if (await readingToggle.isVisible()) await readingToggle.click();
    await expect(markdown).toHaveClass(/crepe-readonly/);
    await expect(markdown.getByRole('heading', { name: 'Welcome to Project Alpha' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Document outline' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to Live Editing' })).toBeVisible();
    await expectLinuxScreenshot(page, 'markdown-reading.png');

    await setTheme(page, 'dark');
    await page.getByRole('button', { name: 'Switch to Live Editing' }).click();
    await expect(markdown).not.toHaveClass(/crepe-readonly/);
    await expect(markdown.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
    await expect(page.getByRole('button', { name: 'Switch to Reading View' })).toBeVisible();
    await expectLinuxScreenshot(page, 'markdown-writing-dark.png');

    await setVisualViewport(page, 1280, 820);
    await openFixtureFile(page, 'data.json');
    const json = page.getByRole('region', { name: 'JSON document' });
    await expect(json.locator('.cm-editor')).toBeVisible();
    await expect(json.locator('.cm-content')).toContainText('"fixture": "alpha"');
    await expect(page.getByRole('button', { name: 'Switch to Live Editing' })).toBeVisible();
    await expectLinuxScreenshot(page, 'json-reading-dark.png');
  } finally {
    await visual.close();
  }
});

test('compact document layout preserves the active reading surface', async ({}, testInfo) => {
  const visual = await launchVisualApp('one-folder', testInfo);
  try {
    const { page } = visual.app;
    await setVisualViewport(page, 760, 600);
    await openFixtureFolder(page);
    await dismissEmbeddingSetup(page);
    await openFixtureFile(page, 'Welcome.md');

    const document = page.getByRole('region', { name: 'Welcome.md Markdown document' });
    await expect(page.getByRole('tab', { name: 'Welcome.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(document.getByRole('heading', { name: 'Welcome to Project Alpha' })).toBeVisible();
    await expect(page.locator('.chat-pane-shell')).toHaveAttribute('aria-hidden', 'true');

    await expectLinuxScreenshot(page, 'compact-document.png');
  } finally {
    await visual.close();
  }
});
