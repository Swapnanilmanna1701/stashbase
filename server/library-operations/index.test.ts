import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryOperationError, createLibraryOperations } from './index.ts';

test('Library Operations rejects AI Index retrieval without embedding configuration', async () => {
  const operations = createLibraryOperations({
    getLibraryInfo: () => ({ folder_home: '/library', folders: [] }),
    retrieval: { search: async () => ({
      evidence: [], availability: { state: 'unavailable' as const, reason: 'embedding-key-required' as const }, truncated: false,
    }) },
  });

  await assert.rejects(
    operations.search({ query: 'architecture' }),
    (error: unknown) => error instanceof LibraryOperationError
      && error.status === 412
      && error.code === 'EMBEDDER_KEY_REQUIRED',
  );
});

test('Library Operations keeps search result identity at the visible source path', async () => {
  const operations = createLibraryOperations({
    getLibraryInfo: () => ({ folder_home: '/library', folders: [] }),
    retrieval: { search: async () => ({
      evidence: [{ sourcePath: '/library/paper.pdf', snippet: 'derived evidence', heading: '', locator: {}, score: 1, chunkIndex: 0 }],
      availability: { state: 'ready' as const }, truncated: false,
    }) },
  });

  assert.deepEqual(
    await operations.search({ query: 'paper', topK: 8 }),
    { hits: [{ fileName: '/library/paper.pdf', chunkIndex: 0, content: 'derived evidence', heading: '', score: 1 }] },
  );
});

test('Library Operations forwards file-type filters to Retrieval', async () => {
  let searchInput: Record<string, unknown> | undefined;
  const operations = createLibraryOperations({
    getLibraryInfo: () => ({ folder_home: '/library', folders: [] }),
    retrieval: { search: async (input) => {
      searchInput = input as unknown as Record<string, unknown>;
      return {
        evidence: [],
        availability: { state: 'ready' as const },
        truncated: false,
      };
    } },
  });

  await operations.search({
    query: 'paper',
    types: ['pdf', 'docx'],
  });

  assert.deepEqual(searchInput?.types, ['pdf', 'docx']);
});

test('Library Operations validates mutation fields before an adapter can write', async () => {
  const operations = createLibraryOperations({
    getLibraryInfo: () => ({ folder_home: '/library', folders: [] }),
  });

  await assert.rejects(
    operations.write({ path: '/library/note.md', content: undefined }),
    (error: unknown) => error instanceof LibraryOperationError && error.status === 400,
  );
});
