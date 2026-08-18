import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import { dismissEmbeddingKeyPrompt, fileTreeRow, openLibraryFolder } from '../support/locators.ts';
import {
  JOURNEY_AUDIO,
  JOURNEY_DOCX,
  JOURNEY_HTML,
  JOURNEY_PDF,
  JOURNEY_XLSX,
  LEGACY_DERIVED_NOTE,
  MALFORMED_DOCX,
  MALFORMED_PDF,
  seedJourneyWorkspaces,
  seedXlsxJourneyWorkspace,
  validXlsx,
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
    await openLibraryFolder(app.page, 'project-alpha');
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
    const transcriptionState = app.page.locator('[role="status"], [role="alert"]').filter({
      hasText: /Download the small local model|whisper-cli is missing|Transcription is not configured/,
    });
    await expect(transcriptionState).toBeVisible();
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
    await openLibraryFolder(app.page, 'project-alpha');
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
    await openLibraryFolder(app.page, 'project-alpha');
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
      // React StrictMode cleans up the first direct-preview effect; the
      // replacement request is the one whose visible fallback is asserted.
      /request: GET .*\/asset\/.*\/broken\.docx.*: net::ERR_ABORTED/,
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
    await openLibraryFolder(app.page, 'project-alpha');
    await dismissEmbeddingKeyPrompt(app.page);

    await expect(fileTreeRow(app.page, LEGACY_DERIVED_NOTE)).toHaveCount(0);
    await fileTreeRow(app.page, JOURNEY_DOCX).click();
    const preview = app.page.locator('iframe[title="DOCX preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.contentFrame().getByText('Valid DOCX journey surface')).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Switch to Live Editing' })).toHaveCount(0);

    // A fresh launch starts in Chat; opening the source above deliberately
    // activates the document surface before exercising its Quick Open command.
    await app.page.keyboard.press(`${primaryKey}+O`);
    const quickOpen = app.page.getByRole('dialog', { name: 'Quick Open' });
    await quickOpen.getByRole('combobox').fill(LEGACY_DERIVED_NOTE);
    await expect(quickOpen.getByRole('option', { name: new RegExp(LEGACY_DERIVED_NOTE.replaceAll('.', '\\.')) })).toHaveCount(0);
    await quickOpen.getByRole('combobox').press('Escape');

    await app.page.keyboard.press(`${primaryKey}+Shift+F`);
    const search = app.page.getByRole('dialog', { name: 'Search library' });
    await search.getByRole('button', { name: 'Exact', exact: true }).click();
    await search.getByRole('combobox').fill('Hidden derived regression phrase');
    await expect(search.getByText(LEGACY_DERIVED_NOTE, { exact: false })).toHaveCount(0);
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/valid-document\.docx: net::ERR_ABORTED/,
      // React StrictMode cancels the first direct-preview request before the
      // replacement succeeds; the rendered DOCX assertion above owns success.
      /request: GET .*\/asset\/.*\/valid-document\.docx.*: net::ERR_ABORTED/,
      /console: Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\./,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('valid XLSX opens as a source-identified read-only multi-sheet workbook', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  seedXlsxJourneyWorkspace(fixture);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await openLibraryFolder(app.page, 'project-alpha');
    await dismissEmbeddingKeyPrompt(app.page);

    await expect(fileTreeRow(app.page, '~$quarterly-workbook.xlsx')).toHaveCount(0);
    await fileTreeRow(app.page, JOURNEY_XLSX).click();
    await expect(app.page.getByTestId('xlsx-preview')).toBeVisible();
    await expect(app.page.getByText('Read only', { exact: true })).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    await expect(app.page.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
    await expect(app.page.getByText('Forecast', { exact: true })).toBeVisible();
    await expect(app.page.getByRole('img', { name: 'Quarterly revenue chart' })).toBeVisible();
    const workbookImage = app.page.getByRole('img', { name: 'Quarterly marker image' });
    await expect(workbookImage).toBeVisible();
    expect(await workbookImage.evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      naturalHeight: image.naturalHeight,
      naturalWidth: image.naturalWidth,
    }))).toEqual({ complete: true, naturalHeight: 1, naturalWidth: 1 });
    await app.page.evaluate(() => {
      (window as typeof window & { __xlsxExternalOpens?: string[] }).__xlsxExternalOpens = [];
      window.open = ((url?: string | URL) => {
        (window as typeof window & { __xlsxExternalOpens?: string[] }).__xlsxExternalOpens?.push(String(url));
        return null;
      }) as typeof window.open;
    });
    const grid = app.page.getByRole('grid', { name: 'Sheet1 worksheet grid' });
    await expect(app.page.getByTestId('xlsx-feature-summary')).toHaveText('Workbook features: frozen panes; merged cells; 1 image; 1 chart.');
    const frozenBodyPane = await grid.locator('canvas').nth(1).boundingBox();
    expect(frozenBodyPane?.height ?? 0).toBeGreaterThan(0);
    const box = await grid.boundingBox();
    expect(box).not.toBeNull();
    // Canvas grid geometry is stable: 40 px row header, 24 px column header,
    // 80 px default columns, and the workbook's 20 px default rows.
    await app.page.mouse.click(box!.x + 86, box!.y + 24 + (2 * 24) + 12);
    await expect(app.page.getByText('A3', { exact: true })).toBeVisible();
    await app.page.mouse.click(box!.x + 86, box!.y + 24 + (2 * 24) + 12);
    await expect.poll(() => app!.page.evaluate(() => (
      (window as typeof window & { __xlsxExternalOpens?: string[] }).__xlsxExternalOpens ?? []
    ))).toEqual([]);
    await app.page.mouse.click(box!.x + 80, box!.y + 24 + (3 * 20) + 10);
    await expect(app.page.getByText('A4', { exact: true })).toBeVisible();
    await app.page.mouse.click(box!.x + 80, box!.y + 24 + (3 * 20) + 10);
    await expect(app.page.getByRole('grid', { name: 'Forecast worksheet grid' })).toBeVisible();
    await app.page.getByRole('tab', { name: 'Sheet1' }).click();
    await expect(app.page.getByRole('grid', { name: 'Sheet1 worksheet grid' })).toBeVisible();
    await grid.focus();
    await app.page.keyboard.press(`${primaryKey}+Home`);
    await app.page.keyboard.press('Shift+ArrowRight');
    await app.page.keyboard.press('Shift+ArrowRight');
    await app.page.keyboard.press('Shift+ArrowDown');
    await expect(app.page.getByText('A1:C2', { exact: true })).toBeVisible();
    await app.page.getByRole('button', { name: 'Copy selected cells' }).click();
    await expect(app.page.getByText('Selected cells copied', { exact: true })).toBeAttached();
    const copiedRange = await app.electron.evaluate(({ clipboard }) => clipboard.readText());
    expect(copiedRange).toBe('Quarter\tRevenue\t\nQ1\t42\t84');

    // An external replacement must advance the source version, retire the
    // controller for the prior generation, and display only the new bytes.
    fs.writeFileSync(path.join(fixture.workspaces.projectA, JOURNEY_XLSX), validXlsx('Updated Quarter'));
    await expect(app.page.getByText('No cell selected', { exact: true })).toBeVisible({ timeout: 20_000 });
    const refreshedGrid = app.page.getByRole('grid', { name: 'Sheet1 worksheet grid' });
    const refreshedBox = await refreshedGrid.boundingBox();
    expect(refreshedBox).not.toBeNull();
    await app.page.mouse.click(refreshedBox!.x + 80, refreshedBox!.y + 34);
    await app.page.getByRole('button', { name: 'Copy selected cells' }).click();
    await expect.poll(() => app!.electron.evaluate(({ clipboard }) => clipboard.readText())).toBe('Updated Quarter');
    await expect(app.page.getByRole('tab', { name: new RegExp(JOURNEY_XLSX) })).toHaveAttribute('aria-selected', 'true');
    await expect(app.page.getByRole('button', { name: 'Switch to Live Editing' })).toHaveCount(0);

    await app.page.getByRole('button', { name: `Close ${JOURNEY_XLSX}` }).click();
    await app.page.keyboard.press(`${primaryKey}+Shift+F`);
    const search = app.page.getByRole('dialog', { name: 'Search library' });
    await search.getByRole('button', { name: 'Exact', exact: true }).click();
    await search.getByRole('combobox').fill('Projected');
    const result = search.locator(`[role="option"][title=${JSON.stringify(`${fixture.workspaces.projectA}/${JOURNEY_XLSX}`)}]`);
    await expect(result).toBeVisible({ timeout: 20_000 });
    await result.click();
    await expect(app.page.getByTestId('xlsx-preview')).toBeVisible();
    await expect(app.page.getByRole('grid', { name: 'Sheet1 worksheet grid' })).toBeVisible();
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/quarterly-workbook\.xlsx: net::ERR_ABORTED/,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('XLSX direct preview remains available when searchable preparation fails', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  seedXlsxJourneyWorkspace(fixture);
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await openLibraryFolder(app.page, 'project-alpha');
    await dismissEmbeddingKeyPrompt(app.page);
    let rejectedPreparations = 0;
    await app.page.route('**/api/files/prepare', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as { path?: unknown };
      if (body.path === JOURNEY_XLSX) {
        rejectedPreparations += 1;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await fileTreeRow(app.page, JOURNEY_XLSX).click();
    await expect(app.page.getByRole('grid', { name: 'Sheet1 worksheet grid' })).toBeVisible();
    await expect(app.page.getByText('Read only', { exact: true })).toBeVisible();
    await expect.poll(() => rejectedPreparations).toBe(1);
    expectOnlyKnownViewerFailures(app, [
      /request: HEAD .*\/api\/files\/quarterly-workbook\.xlsx: net::ERR_ABORTED/,
      /request: POST .*\/api\/files\/prepare: net::ERR_FAILED/,
      /console: Failed to load resource: net::ERR_FAILED/,
    ]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
