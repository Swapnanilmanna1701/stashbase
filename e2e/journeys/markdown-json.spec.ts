import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import {
  activeDocument,
  activeDocumentTab,
  activeMarkdownEditor,
  dismissEmbeddingKeyPrompt,
  documentTab,
  fileTreeRow,
  folderButton,
  saveStatus,
} from '../support/locators.ts';
import { JOURNEY_JSON, JOURNEY_MARKDOWN, seedJourneyWorkspaces } from '../fixtures/journey-workspaces.ts';
import { openedExternalUrls, stubExternalBrowser } from './journey-helpers.ts';

const FRONTMATTER = '---\ntitle: Journey fixture\ntags:\n  - regression\n---\n';

test('Markdown preserves frontmatter across editing and safely routes links and images', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  const sourceFile = path.join(fixture.workspaces.projectA, JOURNEY_MARKDOWN);
  const remoteRequests: string[] = [];
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    app.page.on('request', (request) => {
      if (request.url().includes('remote.invalid')) remoteRequests.push(request.url());
    });
    await stubExternalBrowser(app.electron);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await fileTreeRow(app.page, JOURNEY_MARKDOWN).click();

    const editor = activeMarkdownEditor(app.page);
    await expect(editor).toBeVisible();
    await expect(activeDocument(app.page)).toContainText('Journey Markdown');
    await expect(activeDocument(app.page)).not.toContainText('title: Journey fixture');
    await editor.click({ position: { x: 12, y: 12 } });
    await app.page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
    await app.page.keyboard.insertText('\nEdited through the journey.');
    await expect(saveStatus(app.page)).toBeVisible();
    await expect.poll(() => fs.readFileSync(sourceFile, 'utf8')).toContain('Edited through the journey.');
    expect(fs.readFileSync(sourceFile, 'utf8').startsWith(FRONTMATTER)).toBe(true);

    await app.page.getByRole('button', { name: 'Switch to Reading View' }).click();
    const reading = app.page.getByRole('region', { name: 'Journey Markdown.md Markdown document' });
    await expect(reading).toContainText('Edited through the journey.');
    await expect(reading.getByRole('table')).toContainText('Table journey');
    await expect(reading.getByRole('listitem').filter({ hasText: 'Completed task journey' })).toBeVisible();
    await expect(reading.getByRole('button', { name: 'ts', exact: true })).toBeVisible();
    await expect(reading.getByText('const regressionJourney = true;', { exact: true })).toBeVisible();
    await expect(reading.getByRole('note', { name: 'Note' })).toContainText('Alert journey content.');
    await expect(reading.getByRole('math')).toContainText(/E\s*=\s*m\s*c\s*2/);
    const localImage = activeDocument(app.page).locator('img[src*="/asset/"]').first();
    await expect(localImage).toHaveAttribute('src', /\/asset\//);
    expect(remoteRequests).toEqual([]);
    await localImage.click();
    const lightbox = app.page.getByRole('dialog', { name: 'Image preview' });
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByRole('button', { name: 'Download image' })).toBeVisible();
    await lightbox.getByRole('button', { name: 'Zoom in' }).click();
    await expect(lightbox).toContainText('120%');
    await lightbox.getByRole('button', { name: 'Zoom out' }).click();
    await expect(lightbox).toContainText('100%');
    await app.page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();

    await activeDocument(app.page).getByRole('link', { name: 'Open external fixture' }).click();
    await expect.poll(() => openedExternalUrls(app!.electron)).toEqual(['https://example.com/stashbase-e2e']);
    await expect(app.page).toHaveURL(/^http:\/\/127\.0\.0\.1:/);

    await activeDocument(app.page).getByRole('link', { name: 'Open Second Note' }).click();
    await expect(activeDocumentTab(app.page)).toHaveAttribute('title', 'Second Note.md');
    await expect(activeDocument(app.page)).toContainText('Opened through Quick Open');
    await documentTab(app.page, JOURNEY_MARKDOWN).click();
    await expect(activeDocumentTab(app.page)).toHaveAttribute('title', JOURNEY_MARKDOWN);
    expect(fs.readFileSync(sourceFile, 'utf8')).toContain('Edited through the journey.');

    await app.page.getByRole('button', { name: 'Switch to Live Editing' }).click();
    const liveEditor = activeMarkdownEditor(app.page);
    // Use real editor input to place ProseMirror's selection at the end of a
    // known block, then create the empty paragraph required by the slash menu.
    // Document-wide end shortcuts vary across Chromium platforms.
    const documentHeading = activeDocument(app.page).getByRole('heading', { name: 'Journey Markdown' });
    await documentHeading.click();
    await app.page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
    await app.page.keyboard.press('Enter');
    await app.page.keyboard.insertText('/');
    const headingCommand = activeDocument(app.page).getByText('Heading 1', { exact: true });
    await expect(headingCommand).toBeVisible();
    await headingCommand.click();
    await app.page.keyboard.insertText('Slash journey heading');
    await expect(saveStatus(app.page)).toBeVisible();
    await expect.poll(() => fs.readFileSync(sourceFile, 'utf8')).toContain('# Slash journey heading');
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('JSON remains raw and read-only until explicit editing is enabled', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  const sourceFile = path.join(fixture.workspaces.projectA, JOURNEY_JSON);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await fileTreeRow(app.page, JOURNEY_JSON).click();

    const region = app.page.getByRole('region', { name: 'JSON document' });
    const source = region.locator('.cm-content');
    await expect(source).toContainText('"fixture": "raw journey"');
    await expect(source).toHaveAttribute('contenteditable', 'false');
    await app.page.getByRole('button', { name: 'Switch to Live Editing' }).click();
    await expect(source).toHaveAttribute('contenteditable', 'true');
    await source.click();
    await app.page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
    await app.page.keyboard.insertText('\nmalformed tail');
    await expect(saveStatus(app.page)).toBeVisible();
    await expect.poll(() => fs.readFileSync(sourceFile, 'utf8')).toContain('malformed tail');
    await app.page.getByRole('button', { name: 'Switch to Reading View' }).click();
    await expect(source).toHaveAttribute('contenteditable', 'false');
    await expect(source).toContainText('malformed tail');
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
