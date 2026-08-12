import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import { dismissEmbeddingKeyPrompt, fileTreeRow, folderButton } from '../support/locators.ts';
import { JOURNEY_MARKDOWN, seedJourneyWorkspaces } from '../fixtures/journey-workspaces.ts';
import { primaryKey } from './journey-helpers.ts';

test('Markdown outline disclosure and Find work in editing and reading modes without source mutation', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'one-folder' });
  seedJourneyWorkspaces(fixture);
  const sourceFile = path.join(fixture.workspaces.projectA, JOURNEY_MARKDOWN);
  const original = fs.readFileSync(sourceFile, 'utf8');
  let app: LaunchedApp | undefined;
  try {
    const launched = await launchApp(fixture, testInfo);
    app = launched;
    await test.step('open seeded Markdown document', async () => {
      await folderButton(launched.page, 'project-alpha').click();
      await dismissEmbeddingKeyPrompt(launched.page);
      await fileTreeRow(launched.page, JOURNEY_MARKDOWN).click();
    });

    const outline = app.page.getByRole('navigation', { name: 'Document outline' });
    await test.step('collapse, expand, and navigate outline', async () => {
      await expect(outline.getByRole('button', { name: 'Heading level 2: Outline Section' })).toBeVisible();
      await outline.getByRole('button', { name: 'Collapse Journey Markdown' }).click();
      await expect(outline.getByRole('button', { name: 'Heading level 2: Outline Section' })).toHaveCount(0);
      expect(fs.readFileSync(sourceFile, 'utf8')).toBe(original);
      await outline.getByRole('button', { name: 'Expand Journey Markdown' }).click();
      await outline.getByRole('button', { name: 'Heading level 2: Outline Section' }).click();
      expect(fs.readFileSync(sourceFile, 'utf8')).toBe(original);
    });

    await test.step('find in editing mode', async () => {
      await launched.page.keyboard.press(`${primaryKey}+F`);
      const find = launched.page.getByRole('search', { name: 'Find in document' });
      await find.getByPlaceholder('Find').pressSequentially('Outline find phrase');
      await expect(find).toContainText('1/1');
      await find.getByTitle('Close (Esc)').click();
    });

    await test.step('find in reading mode', async () => {
      await launched.page.getByRole('button', { name: 'Switch to Reading View' }).click();
      await launched.page.keyboard.press(`${primaryKey}+F`);
      const find = launched.page.getByRole('search', { name: 'Find in document' });
      await find.getByPlaceholder('Find').pressSequentially('Deep outline content');
      await expect(find).toContainText('1/1');
      await find.getByTitle('Next (Enter)').click();
      await find.getByTitle('Close (Esc)').click();
    });
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe(original);
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
