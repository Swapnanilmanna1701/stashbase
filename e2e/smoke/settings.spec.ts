import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import {
  appearanceChoice,
  settingsButton,
  settingsDialog,
  settingsTab,
} from '../support/locators.ts';

test('user can navigate Settings and persist appearance across relaunch', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'empty' });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await settingsButton(app.page).click();
    await expect(settingsDialog(app.page)).toBeVisible();
    await expect(settingsTab(app.page, 'Appearance')).toHaveAttribute('aria-selected', 'true');

    for (const section of ['AI Index', 'Transcription', 'MCP', 'Appearance']) {
      await settingsTab(app.page, section).click();
      await expect(settingsTab(app.page, section)).toHaveAttribute('aria-selected', 'true');
    }

    await appearanceChoice(app.page, 'Theme', 'Dark').click();
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await appearanceChoice(app.page, 'Interface size', 'Large').click();
    await expect(app.page.locator('html')).toHaveAttribute('data-ui-scale', 'large');
    await app.page.getByRole('button', { name: 'Close settings' }).click();
    await expect(settingsDialog(app.page)).toBeHidden();

    const persisted = JSON.parse(fs.readFileSync(fixture.configFile, 'utf8')) as {
      appearance?: { theme?: string; uiScale?: string };
    };
    expect(persisted.appearance).toMatchObject({ theme: 'dark', uiScale: 'large' });

    app = await app.relaunch();
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(app.page.locator('html')).toHaveAttribute('data-ui-scale', 'large');
    await settingsButton(app.page).click();
    await expect(appearanceChoice(app.page, 'Theme', 'Dark')).toHaveAttribute('data-pressed');
    await expect(appearanceChoice(app.page, 'Interface size', 'Large')).toHaveAttribute('data-pressed');
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
