import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppFixture, safeInheritedEnvironment } from './fixtures.ts';

test('fixture environment strips credentials, agent history, and runtime overrides', () => {
  const inherited = safeInheritedEnvironment({
    PATH: '/usr/bin:/bin',
    DISPLAY: ':99',
    CI: 'true',
    OPENAI_API_KEY: 'secret-openai',
    ANTHROPIC_AUTH_TOKEN: 'secret-anthropic',
    GITHUB_TOKEN: 'secret-github',
    AWS_ACCESS_KEY_ID: 'secret-access-key',
    SSH_AUTH_SOCK: '/tmp/developer-agent.sock',
    CODEX_HOME: '/developer/codex',
    CLAUDE_CONFIG_DIR: '/developer/claude',
    STASHBASE_CODEX_BIN: '/developer/codex-bin',
    CODEX_CLI_BIN: '/developer/alternate-codex',
    STASHBASE_CLAUDE_BIN: '/developer/claude-bin',
  });

  assert.deepEqual(inherited, {
    PATH: '/usr/bin:/bin',
    DISPLAY: ':99',
    CI: 'true',
  });
});

test('two app fixtures isolate every persistent root and port', async (t) => {
  const first = await createAppFixture({ membership: 'two-folders' });
  const second = await createAppFixture({ membership: 'empty' });
  t.after(async () => {
    await Promise.all([first.cleanup(), second.cleanup()]);
  });

  assert.notEqual(first.root, second.root);
  assert.notEqual(first.port, second.port);
  assert.notEqual(first.home, second.home);
  assert.notEqual(first.userData, second.userData);
  assert.notEqual(first.localData, second.localData);
  assert.notEqual(first.folderHome, second.folderHome);

  for (const fixture of [first, second]) {
    assert.ok(fixture.root.startsWith(path.join(os.tmpdir(), 'stashbase-e2e-')));
    assert.equal(fixture.env.HOME, fixture.home);
    assert.equal(fixture.env.USERPROFILE, fixture.home);
    assert.equal(fixture.env.STASHBASE_LOCAL_DATA_ROOT, fixture.localData);
    assert.equal(fixture.env.STASHBASE_FOLDER_HOME, fixture.folderHome);
    assert.equal(fixture.env.STASHBASE_E2E_USER_DATA, fixture.userData);
    assert.equal(fixture.env.CODEX_HOME, undefined);
    assert.equal(fixture.env.CLAUDE_CONFIG_DIR, undefined);
  }
});

test('fixture membership and source files use the production persisted formats', async (t) => {
  const fixture = await createAppFixture({ membership: 'two-folders' });
  t.after(() => fixture.cleanup());

  const config = JSON.parse(fs.readFileSync(fixture.configFile, 'utf8')) as {
    builtinSeeded?: boolean;
    recentFolders?: Array<{ path: string }>;
  };
  assert.equal(config.builtinSeeded, true);
  assert.deepEqual(
    config.recentFolders?.map((entry) => entry.path),
    [fixture.workspaces.projectA, fixture.workspaces.projectB],
  );
  assert.equal(
    fs.readFileSync(path.join(fixture.workspaces.projectA, 'Welcome.md'), 'utf8'),
    '# Welcome to Project Alpha\n\nAlpha smoke fixture content.\n',
  );
  assert.equal(
    fs.readFileSync(path.join(fixture.workspaces.projectB, 'Notes.md'), 'utf8'),
    '# Project Beta Notes\n\nBeta smoke fixture content.\n',
  );
});

test('fixture cleanup removes only its own scratch root', async () => {
  const fixture = await createAppFixture({ membership: 'empty' });
  const root = fixture.root;
  assert.equal(fs.existsSync(root), true);
  await fixture.cleanup();
  assert.equal(fs.existsSync(root), false);
});
