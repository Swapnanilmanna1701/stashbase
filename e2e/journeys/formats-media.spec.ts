import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import { dismissEmbeddingKeyPrompt, fileTreeRow, folderButton } from '../support/locators.ts';
import {
  JOURNEY_AUDIO,
  JOURNEY_DOCX,
  JOURNEY_HTML,
  JOURNEY_PDF,
  LEGACY_DERIVED_NOTE,
  MALFORMED_DOCX,
  MALFORMED_PDF,
  seedJourneyWorkspaces,
} from '../fixtures/journey-workspaces.ts';
import { primaryKey } from './journey-helpers.ts';

function expectOnlyKnownViewerFailures(app: LaunchedApp, allowed: RegExp[]): void {
  const unexpected = app.errors.records.filter((record) => (
    !allowed.some((pattern) => pattern.test(`${record.kind}: ${record.text}`))
  ));
  expect(unexpected).toEqual([]);
}

test('read-only HTML, image, and audio sources use their dedicated viewers', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);

    await fileTreeRow(app.page, JOURNEY_HTML).click();
    const html = app.page.locator('iframe[title="HTML preview"]');
    await expect(html).toBeVisible();
    await expect(html.contentFrame().getByRole('heading', { name: 'HTML journey surface' })).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Switch to Live Editing' })).toHaveCount(0);

    await fileTreeRow(app.page, 'pixel.png').click();
    await expect(app.page.getByRole('img', { name: 'pixel.png' })).toBeVisible();
    await expect(app.page.getByTitle('Zoom in')).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Switch to Live Editing' })).toHaveCount(0);

    await fileTreeRow(app.page, JOURNEY_AUDIO).click();
    const audio = app.page.locator('audio[controls]');
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute('src', /\/asset\//);
    await expect(app.page.getByText('Transcript', { exact: true })).toBeVisible();
    await expect(app.page.getByRole('alert')).toContainText(/whisper-cli is missing|Transcription is not configured/);
    await expect(app.page.getByRole('button', { name: 'Switch to Live Editing' })).toHaveCount(0);
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/(?:pixel\.png|silence\.wav): net::ERR_ABORTED/,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('valid tiny PDF navigates pages and retains its selected page across a tab switch', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await fileTreeRow(app.page, JOURNEY_PDF).click();
    const jump = app.page.getByTitle('Jump to page');
    await expect(jump).toHaveAccessibleName('Page 1 of 2 — jump to page');
    await jump.click();
    const pageInput = app.page.getByRole('textbox', { name: 'PDF page number' });
    await pageInput.fill('2');
    await pageInput.press('Enter');
    await expect(app.page.getByTitle('Jump to page')).toHaveAccessibleName('Page 2 of 2 — jump to page');

    await fileTreeRow(app.page, 'Welcome.md').click();
    await app.page.getByRole('tab', { name: new RegExp(JOURNEY_PDF) }).click();
    await expect(app.page.getByTitle('Jump to page')).toHaveAccessibleName('Page 2 of 2 — jump to page');
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/(?:two-pages\.pdf|Welcome\.md): net::ERR_ABORTED/,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('malformed PDF and DOCX remain visible source identities with explicit failure UI', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);

    await fileTreeRow(app.page, MALFORMED_PDF).click();
    await expect(app.page.getByText(/Failed to open PDF:/)).toBeVisible();
    await expect(app.page.getByRole('tab', { name: new RegExp(MALFORMED_PDF) })).toHaveAttribute('aria-selected', 'true');

    await fileTreeRow(app.page, MALFORMED_DOCX).click();
    await expect(app.page.getByRole('status').filter({ hasText: 'searchable text is unavailable' })).toBeVisible();
    await expect(app.page.locator('iframe[title="HTML preview"]')).toBeVisible();
    await expect(app.page.getByRole('tab', { name: new RegExp(MALFORMED_DOCX) })).toHaveAttribute('aria-selected', 'true');
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/broken\.(?:pdf|docx): net::ERR_ABORTED/,
      /request: GET .*\/asset\/.*\/broken\.pdf.*: net::ERR_ABORTED/,
      /console: Failed to load resource: the server responded with a status of 409 \(Conflict\)/,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('valid DOCX renders its document and legacy derived notes never surface as files', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);

    await expect(fileTreeRow(app.page, LEGACY_DERIVED_NOTE)).toHaveCount(0);
    await app.page.keyboard.press(`${primaryKey}+O`);
    const quickOpen = app.page.getByRole('dialog', { name: 'Quick Open' });
    await quickOpen.getByRole('combobox').fill(LEGACY_DERIVED_NOTE);
    await expect(quickOpen.getByRole('option', { name: new RegExp(LEGACY_DERIVED_NOTE.replaceAll('.', '\\.')) })).toHaveCount(0);
    await quickOpen.getByRole('combobox').press('Escape');

    await fileTreeRow(app.page, JOURNEY_DOCX).click();
    const preview = app.page.locator('iframe[title="DOCX preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.contentFrame().getByText('Valid DOCX journey surface')).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Switch to Live Editing' })).toHaveCount(0);

    await app.page.keyboard.press(`${primaryKey}+Shift+F`);
    const search = app.page.getByRole('dialog', { name: 'Search library' });
    await search.getByRole('button', { name: 'Exact', exact: true }).click();
    await search.getByRole('combobox').fill('Hidden derived regression phrase');
    await expect(search.getByText(LEGACY_DERIVED_NOTE, { exact: false })).toHaveCount(0);
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/valid-document\.docx: net::ERR_ABORTED/,
      /console: Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\./,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
