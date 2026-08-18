import assert from 'node:assert/strict';
import test from 'node:test';
import {
  folderBasename,
  orderKeywordFiles,
  readLibrarySearchMemory,
  resetLibrarySearchMemory,
  resolveSemanticHits,
  splitLibraryPath,
  writeLibrarySearchMemory,
} from '@/features/search/lib/librarySearch.ts';
import type { LibraryKeywordFile, SearchHit } from '@/common/api/api.ts';

function hit(fileName: string): SearchHit {
  return { fileName, chunkIndex: 0, content: 'x', heading: '', score: 1 };
}

test('splitLibraryPath maps an absolute path to its member folder', () => {
  assert.deepEqual(
    splitLibraryPath('/Users/a/Notes/topic/note.md', ['/Users/a/Notes', '/Users/a/Work']),
    { folder: '/Users/a/Notes', rel: 'topic/note.md' },
  );
});

test('splitLibraryPath picks the deepest containing root', () => {
  assert.deepEqual(
    splitLibraryPath('/Users/a/Notes/sub/x.md', ['/Users/a/Notes', '/Users/a/Notes/sub']),
    { folder: '/Users/a/Notes/sub', rel: 'x.md' },
  );
});

test('splitLibraryPath returns null outside every root and for the root itself', () => {
  assert.equal(splitLibraryPath('/elsewhere/x.md', ['/Users/a/Notes']), null);
  assert.equal(splitLibraryPath('/Users/a/Notes', ['/Users/a/Notes']), null);
  // Sibling with a shared name prefix is NOT inside the root.
  assert.equal(splitLibraryPath('/Users/a/Notes2/x.md', ['/Users/a/Notes']), null);
});

test('splitLibraryPath tolerates trailing slashes and Windows separators', () => {
  assert.deepEqual(
    splitLibraryPath('/Users/a/Notes/x.md', ['/Users/a/Notes/']),
    { folder: '/Users/a/Notes/', rel: 'x.md' },
  );
  assert.deepEqual(
    splitLibraryPath('C:\\Docs\\Notes\\x.md', ['c:/docs/notes']),
    { folder: 'c:/docs/notes', rel: 'x.md' },
  );
});

test('resolveSemanticHits attaches folder identity and drops unplaceable hits', () => {
  const resolved = resolveSemanticHits(
    [hit('/Users/a/Notes/n.md'), hit('/gone/x.md')],
    ['/Users/a/Notes'],
  );
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].folder, '/Users/a/Notes');
  assert.equal(resolved[0].rel, 'n.md');
  assert.equal(resolved[0].fileName, '/Users/a/Notes/n.md');
});

test('orderKeywordFiles lists active-folder files first, keeping order otherwise', () => {
  const file = (folder: string, path: string): LibraryKeywordFile =>
    ({ folder, path, matches: [], totalMatches: 0 });
  const ordered = orderKeywordFiles(
    [file('/w', 'a.md'), file('/n', 'b.md'), file('/w', 'c.md'), file('/n', 'd.md')],
    '/n',
  );
  assert.deepEqual(
    ordered.map((entry) => `${entry.folder}/${entry.path}`),
    ['/n/b.md', '/n/d.md', '/w/a.md', '/w/c.md'],
  );
});

test('library search memory persists patches until reset', () => {
  resetLibrarySearchMemory();
  writeLibrarySearchMemory({ query: 'alpha', mode: 'keyword' });
  assert.equal(readLibrarySearchMemory().query, 'alpha');
  assert.equal(readLibrarySearchMemory().mode, 'keyword');
  // Untouched fields keep their defaults.
  assert.deepEqual(readLibrarySearchMemory().scope, { kind: 'library' });
  resetLibrarySearchMemory();
  assert.equal(readLibrarySearchMemory().query, '');
});

test('folderBasename strips separators', () => {
  assert.equal(folderBasename('/Users/a/Notes/'), 'Notes');
  assert.equal(folderBasename('C:\\Docs\\Work'), 'Work');
});
