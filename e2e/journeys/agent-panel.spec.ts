import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator } from 'playwright';
import type { LaunchedApp } from '../support/app.ts';
import { launchApp } from '../support/app.ts';
import { createAppFixture } from '../support/fixtures.ts';
import { dismissEmbeddingKeyPrompt, ensureLibraryExpanded, folderButton } from '../support/locators.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CODEX = path.resolve(HERE, '..', 'fixtures', 'fake-codex-app-server.mjs');

type ProtocolRecord = {
  event?: string;
  decision?: string;
  prompt?: string;
  turnId?: string;
  cwd?: string;
  params?: Record<string, unknown>;
};

function activeAgentPanel(page: LaunchedApp['page']): Locator {
  return page.locator('[role="tabpanel"]:not([aria-hidden="true"]) .agent-view');
}

function protocolRecords(logFile: string): ProtocolRecord[] {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ProtocolRecord);
}

test('Codex chat keeps its folder-bound transcript through approval and interruption', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'two-folders' });
  const protocolLog = path.join(fixture.artifacts, 'fake-codex-protocol.jsonl');
  fixture.env.STASHBASE_CODEX_BIN = FAKE_CODEX;
  fixture.env.STASHBASE_FAKE_CODEX_LOG = protocolLog;
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);

    await app.page.getByRole('button', { name: 'New Chat', exact: true }).click();
    let panel = activeAgentPanel(app.page);
    let composer = panel.locator('[aria-label="Message agent"]');
    await expect(composer).toHaveAttribute('contenteditable', 'true');
    await expect(panel.getByRole('button', { name: /Session folder: project-alpha/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Model: Fake Codex Model' })).toBeVisible();

    await composer.fill('approval turn');
    await panel.getByRole('button', { name: 'Send message' }).click();
    await expect(panel.getByText('Confirm the deterministic E2E command')).toBeVisible();
    await expect(panel.getByText('printf fake-codex-approved')).toBeVisible();
    await expect.poll(() => protocolRecords(protocolLog).find((entry) => entry.event === 'turn-start' && entry.prompt === 'approval turn')?.params?.cwd)
      .toBe(fixture.workspaces.projectA);

    await panel.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(panel.getByText('Deterministic approval completed.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect.poll(() => protocolRecords(protocolLog).find((entry) => entry.event === 'approval-response')?.decision)
      .toBe('accept');
    await expect(app.page.getByRole('tab', { name: /approval turn/i })).toHaveAttribute('aria-selected', 'true');

    await ensureLibraryExpanded(app.page);
    await folderButton(app.page, 'project-beta').click();
    await expect(app.page).toHaveTitle('project-beta — StashBase');
    await dismissEmbeddingKeyPrompt(app.page);
    const approvalTab = app.page.getByRole('tab', { name: /approval turn/i });
    await expect(approvalTab).toBeVisible();
    await expect(approvalTab).toHaveAttribute('aria-selected', 'false');
    await approvalTab.click();
    await expect(approvalTab).toHaveAttribute('aria-selected', 'true');

    panel = activeAgentPanel(app.page);
    composer = panel.locator('[aria-label="Message agent"]');
    await expect(panel.getByText('Deterministic approval completed.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Session folder: project-alpha — set for this conversation' })).toBeVisible();
    await composer.fill('wait for stop');
    await panel.getByRole('button', { name: 'Send message' }).click();
    const stop = panel.getByRole('button', { name: 'Stop agent' });
    await expect(stop).toBeVisible();
    await expect.poll(() => protocolRecords(protocolLog).find((entry) => entry.event === 'turn-start' && entry.prompt === 'wait for stop')?.params?.cwd)
      .toBe(fixture.workspaces.projectA);
    await stop.click();
    await expect(panel.getByText('wait for stop', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => protocolRecords(protocolLog).find((entry) => entry.event === 'interrupt')?.params?.turnId)
      .toBe('fake-turn-2');

    await composer.fill('terminal error');
    await panel.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => protocolRecords(protocolLog).find((entry) => entry.event === 'terminal-error')?.turnId)
      .toBe('fake-turn-3');
    await expect(panel.getByText('Deterministic fake Agent failure.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Send message' })).toBeVisible();
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});

test('Agent chooser reuses only blank chats, drafts freeze scope, and history resumes through the fake runtime', async ({}, testInfo) => {
  const fixture = await createAppFixture({ membership: 'two-folders' });
  fixture.env.STASHBASE_CODEX_BIN = FAKE_CODEX;
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp(fixture, testInfo);
    await folderButton(app.page, 'project-alpha').click();
    await dismissEmbeddingKeyPrompt(app.page);

    const chatTabs = app.page.getByRole('tablist', { name: 'Chat sessions' });
    const initialCount = await chatTabs.getByRole('tab').count();
    await app.page.getByRole('button', { name: 'Choose agent for new chat' }).click();
    await expect(app.page.getByRole('menuitem', { name: 'Codex' })).toBeVisible();
    await app.page.getByRole('menuitem', { name: 'Codex' }).click();
    await expect(chatTabs.getByRole('tab')).toHaveCount(initialCount);

    let panel = activeAgentPanel(app.page);
    let composer = panel.locator('[aria-label="Message agent"]');
    await composer.fill('unsent alpha draft');
    await ensureLibraryExpanded(app.page);
    await folderButton(app.page, 'project-beta').click();
    await dismissEmbeddingKeyPrompt(app.page);
    await expect(chatTabs.getByRole('tab')).toHaveCount(initialCount + 1);
    await chatTabs.getByRole('tab', { name: /^New Chat Close New Chat$/ }).click();
    panel = activeAgentPanel(app.page);
    composer = panel.locator('[aria-label="Message agent"]');
    await expect(panel.getByRole('button', { name: /Session folder: project-alpha/ })).toBeVisible();
    await expect(composer).toContainText('unsent alpha draft');

    await app.page.getByRole('button', { name: 'New Chat', exact: true }).click();
    await expect(chatTabs.getByRole('tab')).toHaveCount(initialCount + 1);
    panel = activeAgentPanel(app.page);
    composer = panel.locator('[aria-label="Message agent"]');
    await expect(panel.locator('[data-draft-empty]')).toHaveAttribute('data-draft-empty', 'true');
    await expect(panel.getByRole('button', { name: 'Session folder: project-beta' })).toBeVisible();

    await ensureLibraryExpanded(app.page);
    await app.page.getByRole('button', { name: 'Chat history in project-alpha' }).click();
    const history = app.page.getByRole('dialog', { name: 'Chat history in project-alpha' });
    await expect(history.getByRole('button', { name: 'Resume Fixture history session' })).toBeVisible();
    await history.getByRole('button', { name: 'Resume Fixture history session' }).click();
    panel = activeAgentPanel(app.page);
    await expect(panel.getByText('History fixture question')).toBeVisible();
    await expect(panel.getByText('History fixture answer')).toBeVisible();
    await expect(panel.getByRole('button', { name: /Session folder: project-alpha/ })).toBeVisible();
    app.errors.assertNone();
  } finally {
    await app?.close();
    await fixture.cleanup();
  }
});
