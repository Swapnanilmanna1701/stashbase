import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before, beforeEach, mock } from 'node:test';

let fixture: string;
let home: string;
let folder: typeof import('./folder.ts');
let config: typeof import('./app-config.ts');
const envNames = ['STASHBASE_FOLDER_HOME'] as const;
const originalEnv = new Map(envNames.map((name) => [name, process.env[name]]));

before(async () => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-folder-startup-'));
  const homedir = mock.method(os, 'homedir', () => fixture);
  try {
    folder = await import('./folder.ts');
    config = await import('./app-config.ts');
  } finally {
    homedir.mock.restore();
  }
});

beforeEach(() => {
  home = fs.mkdtempSync(path.join(fixture, 'home-'));
  process.env.STASHBASE_FOLDER_HOME = home;
  config.writeAppConfigStrict({});
});

after(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(fixture, { recursive: true, force: true });
});

test('startup and registration retain unavailable members and favorites', async (t) => {
  const unavailable = path.join(home, 'external');
  const opened = path.join(home, 'opened');
  fs.mkdirSync(unavailable);
  fs.mkdirSync(opened);
  const member = { path: unavailable, openedAt: '2026-01-01T00:00:00Z', favorite: true };
  config.writeAppConfigStrict({ recentFolders: [member] });
  const stat = fs.promises.stat;
  const inaccessible = t.mock.method(fs.promises, 'stat', async (...args: Parameters<typeof stat>) => {
    if (args[0] === unavailable) throw Object.assign(new Error('unavailable'), { code: 'EACCES' });
    return stat(...args);
  });
  folder.ensureFolderHome();
  assert.deepEqual(config.readAppConfigStrict().recentFolders, [member]);
  assert.deepEqual(await folder.getRecentFoldersAsync(), []);
  await folder.registerProjectFolderAsync(opened);
  assert.deepEqual(config.readAppConfigStrict().recentFolders?.find((r) => r.path === unavailable), member);
  inaccessible.mock.restore();

  // Both an inaccessible directory and an unmounted/deleted path retain membership.
  fs.rmdirSync(unavailable);
  await folder.registerProjectFolderAsync(opened);
  assert.deepEqual(config.readAppConfigStrict().recentFolders?.find((r) => r.path === unavailable), member);
  fs.mkdirSync(unavailable);
  assert.deepEqual((await folder.getRecentFoldersAsync()).find((r) => r.path === unavailable), member);
});

test('math mode is persisted per project and survives registration without touching source', async () => {
  const first = path.join(home, 'first');
  const second = path.join(home, 'second');
  for (const root of [first, second]) {
    fs.mkdirSync(root);
    await folder.registerProjectFolderAsync(root);
  }
  fs.writeFileSync(path.join(first, 'note.md'), '$x$ and \\$5');
  assert.equal(folder.setProjectMathMode(first, true), true);
  folder.setRecentFavorite(first, true);
  await folder.registerProjectFolderAsync(first);
  const persisted = JSON.parse(fs.readFileSync(path.join(fixture, '.stashbase', 'config.json'), 'utf8'));
  assert.equal(persisted.recentFolders.find((r: { path: string }) => r.path === first).mathMode, true);
  assert.equal(persisted.recentFolders.find((r: { path: string }) => r.path === second).mathMode, undefined);
  assert.equal(folder.setProjectMathMode(path.join(home, 'missing'), true), false);
  assert.equal(folder.setProjectMathMode(first, false), true);
  assert.equal(config.readAppConfigStrict().recentFolders?.find((r) => r.path === first)?.mathMode, undefined);
  assert.equal(fs.readFileSync(path.join(first, 'note.md'), 'utf8'), '$x$ and \\$5');
});

test('first launch and restart leave an empty home without registering projects', () => {
  fs.rmdirSync(home);
  folder.ensureFolderHome();
  assert.deepEqual(fs.readdirSync(home), []);
  assert.deepEqual(config.readAppConfigStrict(), {});
  assert.equal(folder.getCurrentFolder(), null);

  folder.ensureFolderHome();
  assert.deepEqual(fs.readdirSync(home), []);
  assert.deepEqual(config.readAppConfigStrict(), {});
  assert.equal(folder.getCurrentFolder(), null);
});

test('startup preserves existing content without discovering or registering projects', () => {
  const project = path.join(home, 'My project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'draft.md'), 'User content');
  fs.writeFileSync(path.join(home, '.hidden'), 'Hidden content');
  folder.ensureFolderHome();
  assert.deepEqual(fs.readdirSync(home).sort(), ['.hidden', 'My project']);
  assert.equal(fs.readFileSync(path.join(project, 'draft.md'), 'utf8'), 'User content');
  assert.equal(fs.readFileSync(path.join(home, '.hidden'), 'utf8'), 'Hidden content');
  assert.deepEqual(config.readAppConfigStrict(), {});
  assert.equal(folder.getCurrentFolder(), null);
});
