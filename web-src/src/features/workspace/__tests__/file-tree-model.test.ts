/**
 * The explorer's tree model — the ordering, nesting, and pruning rules
 * `buildTree` applies to the flat workspace slices, plus the flattening
 * `visibleNodePaths` performs to produce render (and keyboard) order.
 *
 * These rules used to be reachable only by mounting `FileTree`, so a
 * manual-order regression surfaced as a rendering diff or not at all.
 * See `code-review/renderer-workspace.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { FileMeta, FolderMeta } from '@/common/api/api';
import { toNameSet } from '@/store/state/state';
import {
  buildTree,
  visibleNodePaths,
  type FolderNode,
  type TreeNode,
} from '@/features/workspace/lib/fileTreeModel';

function files(...names: string[]): FileMeta[] {
  return names.map((name) => ({ name, format: 'md' }) as FileMeta);
}

function folders(...paths: string[]): FolderMeta[] {
  return paths.map((path) => ({ path }) as FolderMeta);
}

/** The folder node at `path` ('' is the root). */
function folderAt(root: FolderNode, path: string): FolderNode {
  const find = (node: FolderNode): FolderNode | null => {
    if (node.path === path) return node;
    for (const child of node.children) {
      if (child.type !== 'folder') continue;
      const hit = find(child);
      if (hit) return hit;
    }
    return null;
  };
  const node = find(root);
  assert.ok(node, `no folder at ${JSON.stringify(path)}`);
  return node;
}

function childrenOf(root: FolderNode, path: string): TreeNode[] {
  return folderAt(root, path).children;
}

function namesUnder(root: FolderNode, path: string): string[] {
  return childrenOf(root, path).map((child) => child.name);
}

test('unordered siblings sort folders first, then alphabetically', () => {
  const root = buildTree(
    files('zebra.md', 'Apple.md', 'mango.md'),
    folders('Notes', 'archive'),
    {},
  );
  // Both folders precede every file, and each group is compared with
  // localeCompare — plain codepoint order would put 'Notes' before
  // 'archive' and 'Apple.md' before both.
  assert.deepEqual(namesUnder(root, ''), ['archive', 'Notes', 'Apple.md', 'mango.md', 'zebra.md']);
});

test('a manual order pins its named siblings ahead of everything unranked', () => {
  const root = buildTree(
    files('c.md', 'a.md', 'b.md'),
    folders('Later'),
    { '': ['c.md', 'a.md'] },
  );
  // Ranked names keep the RECORDED order (c before a, not alphabetical)
  // and outrank even a folder — a manual drag is a stronger statement
  // than the folders-first default.
  assert.deepEqual(namesUnder(root, ''), ['c.md', 'a.md', 'Later', 'b.md']);
});

test('the unranked tail keeps the folders-first fallback', () => {
  const root = buildTree(
    files('note.md', 'alpha.md'),
    folders('Zed'),
    { '': ['note.md'] },
  );
  assert.deepEqual(namesUnder(root, ''), ['note.md', 'Zed', 'alpha.md']);
});

test('an empty manual order is no order at all', () => {
  const root = buildTree(files('b.md', 'a.md'), folders(), { '': [] });
  assert.deepEqual(namesUnder(root, ''), ['a.md', 'b.md']);
});

test('stale fileOrder entries are dropped instead of holding a slot', () => {
  // 'gone.md' was renamed or deleted between the last drag and this render.
  const root = buildTree(
    files('kept.md', 'new.md'),
    folders(),
    { '': ['gone.md', 'kept.md'] },
  );
  assert.deepEqual(
    namesUnder(root, ''),
    ['kept.md', 'new.md'],
    'a recorded name with no node contributes nothing — no gap, no placeholder',
  );
});

test('a manual order that names nothing present falls back to the default sort', () => {
  const root = buildTree(
    files('b.md', 'a.md'),
    folders('Z'),
    { '': ['vanished.md', 'also-gone.md'] },
  );
  assert.deepEqual(namesUnder(root, ''), ['Z', 'a.md', 'b.md']);
});

test('manual order applies per folder, each keyed by its own parent path', () => {
  const root = buildTree(
    files('Guides/b.md', 'Guides/a.md', 'top.md'),
    folders('Guides'),
    { Guides: ['b.md', 'a.md'] },
  );
  assert.deepEqual(namesUnder(root, ''), ['Guides', 'top.md']);
  // The nested order is by BASENAME against the 'Guides' key, and sorting
  // recurses into folders the root sort never touched directly.
  assert.deepEqual(namesUnder(root, 'Guides'), ['b.md', 'a.md']);
});

test('nested folders are created recursively from paths alone', () => {
  // Neither 'a' nor 'a/b' appears in `folders` — only the deepest path and
  // a file below it. Every intermediate still has to materialise.
  const root = buildTree(files('a/b/c/deep.md'), folders('a/b/c'), {});
  assert.deepEqual(namesUnder(root, ''), ['a']);
  assert.deepEqual(namesUnder(root, 'a'), ['b']);
  assert.deepEqual(namesUnder(root, 'a/b'), ['c']);

  const deep = childrenOf(root, 'a/b/c')[0];
  assert.equal(deep.type, 'file');
  assert.equal(deep.path, 'a/b/c/deep.md', 'a file node carries its FULL path');
  assert.equal(deep.name, 'deep.md', 'and its basename separately');
});

test('an intermediate folder is created once, however many children arrive', () => {
  const root = buildTree(
    files('shared/one.md', 'shared/two.md'),
    folders('shared', 'shared'),
    {},
  );
  assert.deepEqual(namesUnder(root, ''), ['shared']);
  assert.deepEqual(namesUnder(root, 'shared'), ['one.md', 'two.md']);
});

test('the root is a nameless folder at the empty path', () => {
  assert.deepEqual(
    buildTree(files(), folders(), {}),
    { type: 'folder', name: '', path: '', children: [] },
  );
});

test('visible paths descend only into expanded folders, in render order', () => {
  const root = buildTree(
    files('Guides/inner.md', 'Guides/Deep/buried.md', 'top.md'),
    folders('Guides', 'Guides/Deep'),
    {},
  );

  assert.deepEqual(
    visibleNodePaths(root.children, {}),
    ['Guides', 'top.md'],
    'a collapsed folder contributes only its own row',
  );
  assert.deepEqual(
    visibleNodePaths(root.children, toNameSet(['Guides'])),
    ['Guides', 'Guides/Deep', 'Guides/inner.md', 'top.md'],
  );
  assert.deepEqual(
    visibleNodePaths(root.children, toNameSet(['Guides', 'Guides/Deep'])),
    ['Guides', 'Guides/Deep', 'Guides/Deep/buried.md', 'Guides/inner.md', 'top.md'],
  );
  assert.deepEqual(
    visibleNodePaths(root.children, toNameSet(['Guides/Deep'])),
    ['Guides', 'top.md'],
    'expansion below a collapsed ancestor stays off screen',
  );
});
