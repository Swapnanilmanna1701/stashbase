import { expect, test } from '@playwright/test';
import type { Route } from 'playwright';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import { folderButton } from '../support/locators.ts';
import { primaryKey } from './journey-helpers.ts';

test('semantic search UI renders deterministic loading, grouped, empty, and error states', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'two-folders' });
  let releaseGrouped: (() => void) | undefined;
  const groupedGate = new Promise<void>((resolve) => { releaseGrouped = resolve; });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await app.page.route('**/api/embedder', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        provider: 'openai', hasKey: true, model: 'fixture-model',
      }) });
    });
    await app.page.route('**/api/library/search', async (route: Route) => {
      const body = route.request().postDataJSON() as { query?: string };
      if (body.query === 'grouped fixture') {
        await groupedGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits: [
          {
            fileName: `${fixture.workspaces.projectA}/Welcome.md`,
            chunkIndex: 0,
            content: '# Alpha evidence\nGrouped semantic alpha.',
            heading: 'Alpha evidence',
            startLine: 1,
            endLine: 2,
            score: 0.91,
          },
          {
            fileName: `${fixture.workspaces.projectB}/Notes.md`,
            chunkIndex: 0,
            content: '# Beta evidence\nGrouped semantic beta.',
            heading: 'Beta evidence',
            startLine: 1,
            endLine: 2,
            score: 0.82,
          },
        ] }) });
        return;
      }
      if (body.query === 'empty fixture') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hits: [] }) });
        return;
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'semantic fixture unavailable' }),
      });
    });

    await folderButton(app.page, 'project-alpha').click();
    await app.page.keyboard.press(`${primaryKey}+Shift+F`);
    const search = app.page.getByRole('dialog', { name: 'Search library' });
    const input = search.getByRole('combobox');
    await input.fill('grouped fixture');
    await expect(search.getByText('Searching…')).toBeVisible();
    releaseGrouped?.();
    await expect(search.getByText('project-alpha', { exact: true })).toBeVisible();
    await expect(search.getByText('project-beta', { exact: true })).toBeVisible();
    await expect(search.getByRole('option', { name: /Welcome\.md.*Grouped semantic alpha/ })).toBeVisible();
    await expect(search.getByRole('option', { name: /Notes\.md.*Grouped semantic beta/ })).toBeVisible();

    await input.fill('empty fixture');
    await expect(search.getByText('No matches', { exact: true })).toBeVisible();
    await input.fill('error fixture');
    await expect(search.getByText('Search failed: semantic fixture unavailable')).toBeVisible();
    expect(app.errors.records).toEqual([expect.objectContaining({
      kind: 'console',
      text: 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
    })]);
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
