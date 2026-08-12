import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { assertPortAvailable, launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';

test('real Electron launches with an isolated profile and closes cleanly', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'empty' });
  const app = await launchApp(fixture, testInfo);
  try {
    await expect(app.page).toHaveTitle('StashBase');
    await expect(app.page.locator('body')).toHaveAttribute('data-boot-settled', '1');
    app.errors.assertNone();
  } finally {
    await app.close();
    await assertPortAvailable(fixture.port);
    assert.equal(fixture.home.includes('stashbase-e2e-'), true);
    await fixture.cleanup();
  }
});
