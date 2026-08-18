import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMilkdownLink } from '@/features/documents/milkdown/navigation.ts';

test('Milkdown links stay inside the workspace and preserve heading fragments', () => {
  assert.deepEqual(resolveMilkdownLink('../Other%20note.md#part', 'notes/current.md'), {
    kind: 'note', path: 'Other note.md', anchor: 'part',
  });
  assert.deepEqual(resolveMilkdownLink('#part', 'notes/current.md'), { kind: 'anchor', id: 'part' });
});

test('Milkdown links reject encoded separators and allow only HTTP(S) externally', () => {
  assert.deepEqual(resolveMilkdownLink('%2Fsecret.md', 'notes/current.md'), { kind: 'ignore' });
  assert.deepEqual(resolveMilkdownLink('javascript:alert(1)', 'notes/current.md'), { kind: 'ignore' });
  assert.deepEqual(resolveMilkdownLink('file:///etc/passwd', 'notes/current.md'), { kind: 'ignore' });
  assert.deepEqual(resolveMilkdownLink('https://example.com/a', 'notes/current.md'), {
    kind: 'external', href: 'https://example.com/a',
  });
});

test('Milkdown local non-note assets never open in the external browser', () => {
  assert.deepEqual(resolveMilkdownLink('photo.png', 'notes/current.md'), { kind: 'ignore' });
  assert.deepEqual(resolveMilkdownLink('manual.pdf', 'notes/current.md'), { kind: 'ignore' });
});

test('links inside an out-of-folder document resolve back to that member folder', () => {
  // Relative link: inherits the base URL's __folder token.
  assert.deepEqual(resolveMilkdownLink('sibling.md', 'notes/current.md', '/Users/a/Other'), {
    kind: 'note', path: 'notes/sibling.md', anchor: undefined, folder: '/Users/a/Other',
  });
  // Anchors and externals are unaffected by the folder context.
  assert.deepEqual(resolveMilkdownLink('#part', 'notes/current.md', '/Users/a/Other'), { kind: 'anchor', id: 'part' });
  assert.deepEqual(resolveMilkdownLink('https://example.com/a', 'notes/current.md', '/Users/a/Other'), {
    kind: 'external', href: 'https://example.com/a',
  });
});
