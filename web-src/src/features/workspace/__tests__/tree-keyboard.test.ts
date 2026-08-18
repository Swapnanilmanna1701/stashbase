/**
 * The file tree's keyboard model — which row owns the single tab stop,
 * where an arrow key sends it, and how the row registry is ordered.
 *
 * Ordering used to be re-derived from the DOM (`querySelectorAll` over
 * `[role="treeitem"]` minus anything inside a `.tree-children.collapsed`
 * subtree), which made arrow-key navigation depend on a CSS class name.
 * It now comes from `visibleNodePaths`, and these are the rules that
 * replaced it. See `hooks/useTreeRoving.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextFocusIndex,
  orderedRows,
  resolveRovingPath,
} from '@/features/workspace/lib/treeKeyboard';

const visible = ['Guides', 'Guides/inner.md', 'top.md'];

test('the last focused row keeps the tab stop while it is on screen', () => {
  assert.equal(resolveRovingPath('Guides/inner.md', 'top.md', visible), 'Guides/inner.md');
});

test('a roving row that scrolled out of the tree falls back to the selection', () => {
  // Collapsing 'Guides' takes the focused child off screen; the tab stop
  // must land somewhere real rather than on a row that no longer renders.
  assert.equal(resolveRovingPath('Guides/inner.md', 'top.md', ['Guides', 'top.md']), 'top.md');
});

test('with neither a live roving row nor a live selection, the first row holds it', () => {
  assert.equal(resolveRovingPath(null, null, visible), 'Guides');
  assert.equal(resolveRovingPath('gone.md', 'also-gone.md', visible), 'Guides');
});

test('an empty tree has no tab stop at all', () => {
  assert.equal(resolveRovingPath('Guides', 'top.md', []), null);
});

test('arrow keys step one row and stop at the ends', () => {
  assert.equal(nextFocusIndex('ArrowDown', 0, 3), 1);
  assert.equal(nextFocusIndex('ArrowUp', 2, 3), 1);
  assert.equal(nextFocusIndex('ArrowDown', 2, 3), null, 'no wrap past the last row');
  assert.equal(nextFocusIndex('ArrowUp', 0, 3), null, 'no wrap before the first row');
});

test('Home and End jump to the ends', () => {
  assert.equal(nextFocusIndex('Home', 2, 3), 0);
  assert.equal(nextFocusIndex('End', 0, 3), 2);
  assert.equal(nextFocusIndex('Home', 0, 3), 0, 'already there is still a resolved target');
});

test('keys the tree does not own are left to the row handler', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'a']) {
    assert.equal(nextFocusIndex(key, 1, 3), null, `${key} must fall through`);
  }
});

test('an empty tree yields no navigation target for any key', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    assert.equal(nextFocusIndex(key, -1, 0), null);
  }
});

test('row order follows the visible path list, not registration order', () => {
  // Rows register as they mount, in whatever order React commits them;
  // the tree's order is the one `visibleNodePaths` produced.
  const rows = new Map([
    ['top.md', 'row:top'],
    ['Guides', 'row:folder'],
    ['Guides/inner.md', 'row:inner'],
  ]);
  assert.deepEqual(orderedRows(visible, rows), ['row:folder', 'row:inner', 'row:top']);
});

test('rows inside a collapsed subtree stay registered but out of the order', () => {
  // Collapsed rows are rendered and merely hidden, so the registry holds
  // them; filtering by `visiblePaths` is what keeps them unreachable.
  const rows = new Map([
    ['Guides', 'row:folder'],
    ['Guides/inner.md', 'row:inner'],
    ['top.md', 'row:top'],
  ]);
  assert.deepEqual(orderedRows(['Guides', 'top.md'], rows), ['row:folder', 'row:top']);
});

test('a visible path with no registered row is skipped, not left as a hole', () => {
  // One render ahead of the ref commit, or a row already unmounting.
  const rows = new Map([['top.md', 'row:top']]);
  assert.deepEqual(orderedRows(visible, rows), ['row:top']);
  assert.deepEqual(orderedRows([], rows), []);
});
