import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import {
  activeDocumentTab,
  dismissEmbeddingKeyPrompt,
  documentTab,
  fileTreeRow,
  folderButton,
  quickOpenDialog,
  quickOpenInput,
} from '../support/locators.ts';
import { primaryKey } from './journey-helpers.ts';

async function openFolderMenu(app: LaunchedApp, name: string): Promise<void> {
  await app.page.getByRole('button', { name: `More actions for ${name}` }).click();
}

test('persistent tabs prevent duplicates, reuse a blank tab, and expose MRU Editor History', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await fileTreeRow(app.page, 'Welcome.md').click();
    await fileTreeRow(app.page, 'Second Note.md').click();
    await fileTreeRow(app.page, 'Welcome.md').click();
    await expect(documentTab(app.page, 'Welcome.md')).toHaveCount(1);
    await expect(documentTab(app.page, 'Second Note.md')).toHaveCount(1);

    await app.page.keyboard.press(`${primaryKey}+T`);
    await expect(activeDocumentTab(app.page)).toHaveAttribute('title', 'Empty tab');
    await fileTreeRow(app.page, 'AGENTS.md').click();
    await expect(app.page.locator('.tab-strip-inner > [role="tab"]')).toHaveCount(3);
    await expect(documentTab(app.page, 'AGENTS.md')).toHaveCount(1);

    await activeDocumentTab(app.page).focus();
    await app.page.keyboard.down('Control');
    await app.page.keyboard.press('Tab');
    await app.page.keyboard.press('Tab');
    const history = app.page.getByRole('dialog', { name: 'Editor History' });
    await expect(history).toBeVisible();
    await expect(history.getByRole('option').first()).toContainText('AGENTS.md');
    await expect(history.getByRole('option', { name: 'Second Note.md' })).toHaveAttribute('aria-selected', 'true');
    await app.page.keyboard.up('Control');
    await expect(activeDocumentTab(app.page)).toHaveAttribute('title', 'Second Note.md');
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('Quick Open honors editor recency and command availability while Settings owns topmost input', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await fileTreeRow(app.page, 'Welcome.md').click();
    await fileTreeRow(app.page, 'Second Note.md').click();
    await documentTab(app.page, 'Welcome.md').click();

    await app.page.keyboard.press(`${primaryKey}+O`);
    await expect(quickOpenDialog(app.page).getByRole('option').first()).toContainText('Welcome.md');
    await quickOpenInput(app.page).fill('wel');
    await expect(quickOpenDialog(app.page).getByRole('option').first()).toContainText('Welcome.md');
    await quickOpenInput(app.page).press('Escape');

    await app.page.keyboard.press('F1');
    const palette = app.page.getByRole('dialog', { name: 'Command Palette' });
    await expect(palette.getByRole('option', { name: /Save/ })).toBeVisible();
    await expect(palette.getByRole('option', { name: /Toggle Editing Mode/ })).toBeVisible();
    await palette.getByRole('combobox').press('Escape');
    await app.page.getByRole('button', { name: 'Close Welcome.md' }).click();
    await app.page.getByRole('button', { name: 'Close Second Note.md' }).click();
    await app.page.keyboard.press('F1');
    const emptyPalette = app.page.getByRole('dialog', { name: 'Command Palette' });
    await expect(emptyPalette.getByRole('option', { name: /Save/ })).toHaveCount(0);
    await expect(emptyPalette.getByRole('option', { name: /Find in Document/ })).toHaveCount(0);
    await emptyPalette.getByRole('combobox').press('Escape');

    await app.page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = app.page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await app.page.keyboard.press(`${primaryKey}+O`);
    await expect(quickOpenDialog(app.page)).toHaveCount(0);
    await app.page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('Favorites pin above recents and removing the active folder returns to Home without deleting it', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'two-folders' });
  const preserved = `${fixture.workspaces.projectA}/Welcome.md`;
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await app.page.getByRole('button', { name: 'Library', exact: true }).click();
    await openFolderMenu(app, 'project-beta');
    await app.page.getByRole('menuitem', { name: 'Add to Favorites' }).click();
    const library = app.page.locator('#sidebar-files-section');
    await expect(library.getByRole('button', { name: 'project-beta', exact: true })).toHaveCount(1);
    const labels = await library.locator('button[title]').allTextContents();
    expect(labels[0]?.trim()).toBe('project-beta');

    await openFolderMenu(app, 'project-alpha');
    await app.page.getByRole('menuitem', { name: 'Remove from Library' }).click();
    await app.page.getByRole('dialog', { name: 'Remove from Library?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(app.page).toHaveTitle('StashBase');
    await expect(app.page.getByRole('button', { name: 'Select project-alpha folder root' })).toHaveCount(0);
    await expect(folderButton(app.page, 'project-beta')).toBeVisible();
    expect(fs.existsSync(preserved)).toBe(true);
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
