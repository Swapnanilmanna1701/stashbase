import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';

test('intentional assertion failure retains Electron diagnostics', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'empty' });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await expect(app.page).toHaveTitle('Intentional diagnostic failure');
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
