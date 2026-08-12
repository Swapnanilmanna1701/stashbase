import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import type { LaunchedApp } from '../support/app.ts';
import { assertPortAvailable, launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function filesBelow(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

test('renderer page errors are collected and attached with the Electron trace', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'empty' });
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await app.page.evaluate(() => {
      setTimeout(() => { throw new Error('intentional renderer diagnostic'); }, 0);
    });
    await expect.poll(() => app?.errors.records.some(
      (record) => record.kind === 'page' && record.text.includes('intentional renderer diagnostic'),
    )).toBe(true);
    expect(() => app?.errors.assertNone()).toThrow(/intentional renderer diagnostic/);
    await app.close();
    app = undefined;
    expect(testInfo.attachments.map((attachment) => attachment.name)).toEqual(
      expect.arrayContaining(['electron-trace', 'electron-output']),
    );
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('failed assertion probe exits red and retains a trace artifact', async ({}, testInfo) => {
  const outputRoot = testInfo.outputPath('intentional-failure-probe');
  fs.mkdirSync(outputRoot, { recursive: true });
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  let exitCode = 0;
  let output = '';
  try {
    await execFileAsync(pnpm, [
      'exec', 'playwright', 'test',
      '--config=e2e/probes/playwright.probe.config.ts',
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, STASHBASE_E2E_PROBE_OUTPUT: outputRoot },
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    exitCode = failure.code ?? -1;
    output = `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`;
  }
  expect(exitCode).toBe(1);
  expect(output).toContain('Intentional diagnostic failure');
  expect(filesBelow(outputRoot).some((file) => file.endsWith('.zip'))).toBe(true);
});

test('two isolated fixtures can run real Electron apps simultaneously', async ({}, testInfo) => {
  const [firstFixture, secondFixture] = await Promise.all([
    createAppFixture({ membership: 'empty' }),
    createAppFixture({ membership: 'empty' }),
  ]);
  let first: LaunchedApp | undefined;
  let second: LaunchedApp | undefined;
  try {
    [first, second] = await Promise.all([
      launchApp(firstFixture, testInfo),
      launchApp(secondFixture, testInfo),
    ]);
    await expect(first.page).toHaveTitle('StashBase');
    await expect(second.page).toHaveTitle('StashBase');
    expect(new URL(first.page.url()).port).toBe(String(firstFixture.port));
    expect(new URL(second.page.url()).port).toBe(String(secondFixture.port));
    const [firstUserData, secondUserData] = await Promise.all([
      first.electron.evaluate(({ app }) => app.getPath('userData')),
      second.electron.evaluate(({ app }) => app.getPath('userData')),
    ]);
    expect(firstUserData).toBe(firstFixture.userData);
    expect(secondUserData).toBe(secondFixture.userData);
    expect(firstUserData).not.toBe(secondUserData);
  } finally {
    await Promise.all([first?.close(), second?.close()]);
    await Promise.all([
      assertPortAvailable(firstFixture.port),
      assertPortAvailable(secondFixture.port),
    ]);
    await Promise.all([firstFixture.cleanup(), secondFixture.cleanup()]);
  }
});

test('a real server bind failure preserves diagnostics and leaves no Electron descendant', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'empty' });
  const blocker = net.createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(fixture.port, '127.0.0.1', resolve);
  });
  try {
    await expect(launchApp(fixture, testInfo, { readinessTimeoutMs: 5_000 })).rejects.toThrow();
    expect(testInfo.attachments.map((attachment) => attachment.name)).toContain('electron-output');
  } finally {
    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    await assertPortAvailable(fixture.port);
    await fixture.cleanup();
  }
});

test('boot readiness timeout terminates only the isolated app and releases its port', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'empty' });
  fixture.env.STASHBASE_E2E_BOOT_DELAY_MS = '5000';
  try {
    await expect(launchApp(fixture, testInfo, { readinessTimeoutMs: 500 })).rejects.toThrow();
    expect(testInfo.attachments.map((attachment) => attachment.name)).toContain('electron-output');
    await assertPortAvailable(fixture.port);
  } finally {
    await fixture.cleanup();
  }
});
