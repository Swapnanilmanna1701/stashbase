import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import { activeDocument, activeDocumentTab, dismissEmbeddingKeyPrompt, fileTreeRow, folderButton } from '../support/locators.ts';
import { primaryKey } from './journey-helpers.ts';

test('Find transfers its query and active-folder scope to exact all-files search', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'two-folders' });
  let app: LaunchedApp | undefined;
  try {
    const launched = await launchApp(fixture, testInfo);
    app = launched;
    await test.step('open document Find', async () => {
      await folderButton(launched.page, 'project-alpha').click();
      await dismissEmbeddingKeyPrompt(launched.page);
      await fileTreeRow(launched.page, 'Welcome.md').click();
      await expect(activeDocument(launched.page)).toContainText('Alpha smoke fixture content');
      await launched.page.keyboard.press(`${primaryKey}+F`);
    });
    const find = app.page.getByRole('search', { name: 'Find in document' });
    await test.step('configure and transfer Find query', async () => {
      await find.getByPlaceholder('Find').fill('Alpha smoke fixture');
      await expect(find).toContainText('1/1');
      await find.getByTitle('Match case').click();
      await find.getByTitle('Whole word').click();
      await expect(find.getByTitle('Match case')).toHaveAttribute('aria-pressed', 'true');
      await find.getByTitle('Search all files').click();
    });

    const search = app.page.getByRole('dialog', { name: 'Search library' });
    await test.step('verify exact active-folder search state', async () => {
      await expect(search).toBeVisible();
      await expect(search.getByRole('combobox')).toHaveValue('Alpha smoke fixture');
      await expect(search.getByRole('combobox')).toHaveAttribute('placeholder', 'Search in project-alpha');
      await expect(search.getByRole('button', { name: 'Exact' })).toHaveAttribute('data-pressed');
      await expect(search.getByRole('button', { name: 'Search scope' })).toContainText('project-alpha');
    });
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('splitters expose keyboard-updated ARIA values and compact resize preserves the active document', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await fileTreeRow(app.page, 'Welcome.md').click();

    const sidebar = app.page.getByRole('separator', { name: 'Resize sidebar' });
    const sidebarBefore = Number(await sidebar.getAttribute('aria-valuenow'));
    await sidebar.focus();
    await sidebar.press('ArrowRight');
    await expect(sidebar).toHaveAttribute('aria-valuenow', String(sidebarBefore + 16));

    const chat = app.page.getByRole('separator', { name: 'Resize Agent chat panel' });
    const chatBefore = Number(await chat.getAttribute('aria-valuenow'));
    await chat.focus();
    await chat.press('ArrowLeft');
    await expect(chat).toHaveAttribute('aria-valuenow', String(chatBefore + 16));

    await app.page.setViewportSize({ width: 900, height: 700 });
    await expect(activeDocumentTab(app.page)).toHaveAttribute('title', 'Welcome.md');
    await expect(activeDocument(app.page)).toContainText('Alpha smoke fixture content');
    await expect(app.page.locator('.chat-pane-shell')).toHaveAttribute('aria-hidden', 'true');

    await app.page.setViewportSize({ width: 1280, height: 800 });
    await expect(activeDocumentTab(app.page)).toHaveAttribute('title', 'Welcome.md');
    await expect(activeDocument(app.page)).toContainText('Alpha smoke fixture content');
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
