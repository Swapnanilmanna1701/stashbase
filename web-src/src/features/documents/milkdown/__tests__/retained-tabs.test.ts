import assert from 'node:assert/strict';
import test from 'node:test';
import { retainedMarkdownTabs } from '@/features/documents/milkdown/retainedTabs.ts';

function tab(id: string, format: string | null = 'md') {
  return { id, file: format ? { format } : null };
}

test('retained Markdown tabs follow MRU priority while rendering in tab-strip order', () => {
  const tabs = [tab('one'), tab('json', 'json'), tab('two'), tab('three'), tab('four'), tab('five'), tab('six')];
  const retained = retainedMarkdownTabs(
    tabs,
    ['six', 'five', 'four', 'three', 'two', 'one', 'json', 'closed'],
    'six',
  );
  assert.deepEqual(retained.map((candidate) => candidate.id), ['two', 'three', 'four', 'five', 'six']);
});

test('the active Markdown tab is retained defensively even before history catches up', () => {
  const tabs = [tab('active'), tab('previous'), tab('older')];
  const retained = retainedMarkdownTabs(tabs, ['previous', 'older'], 'active', 2);
  assert.deepEqual(retained.map((candidate) => candidate.id), ['active', 'previous']);
});
