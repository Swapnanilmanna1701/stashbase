import assert from 'node:assert/strict';
import test from 'node:test';
import { rankQuickOpen } from '@/features/search/lib/quickOpen';

test('Quick Open shows unique recent editors before a query', () => {
  const items = rankQuickOpen(['notes/plan.md', 'readme.md'], '', ['notes/plan.md', 'notes/plan.md', 'missing.md']);
  assert.deepEqual(items.map((item) => item.path), ['notes/plan.md']);
});

test('Quick Open keeps caller-supplied most-recent editor order', () => {
  const items = rankQuickOpen(['one.md', 'two.md', 'three.md'], '', ['two.md', 'one.md']);
  assert.deepEqual(items.map((item) => item.path), ['two.md', 'one.md']);
});

test('Quick Open ranks a basename match above a relative-path-only match', () => {
  const items = rankQuickOpen(['archive/project-notes.md', 'project/other.md'], 'pro', []);
  assert.deepEqual(items.map((item) => item.path), ['archive/project-notes.md', 'project/other.md']);
});

test('Quick Open distinguishes duplicate names through their complete paths', () => {
  const items = rankQuickOpen(['one/report.md', 'two/report.md'], 'report', []);
  assert.deepEqual(items.map((item) => item.path), ['one/report.md', 'two/report.md']);
});
