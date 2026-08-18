import assert from 'node:assert/strict';
import test from 'node:test';
import {
  libraryListPlan,
  type LibraryListEntry,
} from '@/features/workspace/lib/libraryListPlan';

function entry(path: string, favorite = false): LibraryListEntry {
  return { path, openedAt: '2026-01-01T00:00:00.000Z', favorite };
}

function names(plan: { visible: LibraryListEntry[] }): string[] {
  return plan.visible.map((e) => e.path);
}

test('every row renders: favorites pinned first, then the rest, both in recents order', () => {
  const entries = [
    entry('/a'),
    entry('/fav1', true),
    entry('/b'),
    entry('/fav2', true),
    entry('/c'),
    entry('/d'),
    entry('/e'),
    entry('/f'),
    entry('/fav3', true),
    entry('/g'),
  ];
  const plan = libraryListPlan(entries, '');
  assert.deepEqual(names(plan), [
    '/fav1', '/fav2', '/fav3', // every favorite, pinned first, recents order
    '/a', '/b', '/c', '/d', '/e', '/f', '/g', // then everything else
  ]);
});

test('the active folder is excluded from the list', () => {
  const entries = [entry('/active'), entry('/fav', true), entry('/other')];
  assert.deepEqual(names(libraryListPlan(entries, '/active')), ['/fav', '/other']);
});

test('active-folder exclusion uses folder-reference semantics, not string identity', () => {
  const entries = [entry('/active/'), entry('/other')];
  assert.deepEqual(names(libraryListPlan(entries, '/active')), ['/other']);
});

test('an active folder missing from the membership list excludes nothing', () => {
  const entries = [entry('/a'), entry('/b')];
  assert.deepEqual(names(libraryListPlan(entries, '/just-opened')), ['/a', '/b']);
});

test('an empty library yields an empty plan', () => {
  assert.deepEqual(libraryListPlan([], '').visible, []);
});
