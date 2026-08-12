import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRetrieval } from './index.ts';

test('Retrieval reports unavailable semantic mode without invoking its adapter', async () => {
  let called = false;
  const retrieval = createRetrieval({
    hasEmbeddingKey: () => false,
    vectorSearch: async () => {
      called = true;
      return [];
    },
  });

  assert.deepEqual(
    await retrieval.search({ mode: 'semantic', query: 'architecture', folderRoot: '/library' }),
    { evidence: [], availability: { state: 'unavailable', reason: 'embedding-key-required' }, truncated: false },
  );
  assert.equal(called, false);
});

test('Retrieval normalizes keyword matches into flat visible-source evidence', async () => {
  const retrieval = createRetrieval({
    keywordSearch: async () => ({
      files: [{
        path: 'notes/brief.md', totalMatches: 2,
        matches: [
          { line: 4, text: 'System architecture', ranges: [[7, 19]] },
          { line: 9, text: 'architecture diagram', ranges: [[0, 12]] },
        ],
      }],
      truncated: false,
    }),
  });

  const result = await retrieval.search({ mode: 'keyword', query: 'architecture', folderRoot: '/library' });

  assert.deepEqual(result, {
    evidence: [
      { sourcePath: '/library/notes/brief.md', snippet: 'System architecture', ranges: [[7, 19]], sourceMatchCount: 2, locator: { line: 4 } },
      { sourcePath: '/library/notes/brief.md', snippet: 'architecture diagram', ranges: [[0, 12]], sourceMatchCount: 2, locator: { line: 9 } },
    ],
    availability: { state: 'ready' },
    truncated: false,
  });
});

test('Retrieval preserves semantic source identity and source-safe locators', async () => {
  const retrieval = createRetrieval({
    hasEmbeddingKey: () => true,
    vectorSearch: async () => [{
      fileName: '/library/paper.pdf', chunkIndex: 3, content: 'derived evidence', heading: 'Results',
      startLine: 42, endLine: 45, pdfPage: 7, score: 0.9,
    }],
  });

  const result = await retrieval.search({ mode: 'semantic', query: 'evidence', folderRoot: '/library' });

  assert.deepEqual(result.evidence, [{
    sourcePath: '/library/paper.pdf', snippet: 'derived evidence', heading: 'Results',
    locator: { line: 42, endLine: 45, page: 7 }, score: 0.9, chunkIndex: 3,
  }]);
});

test('Retrieval maps source categories to semantic index extension filters', async () => {
  let extensions: string[] | undefined;
  const retrieval = createRetrieval({
    hasEmbeddingKey: () => true,
    vectorSearch: async (_query, _topK, _folderRoot, _pathPrefix, requestedExtensions) => {
      extensions = requestedExtensions;
      return [];
    },
  });

  await retrieval.search({
    mode: 'semantic',
    query: 'evidence',
    types: ['pdf', 'docx'],
  });

  assert.deepEqual(extensions, ['.pdf', '.docx']);
});

test('Retrieval remaps scoped semantic legacy-derived hits to their visible source', async () => {
  const folderRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stashbase-retrieval-'));
  const sourcePath = path.join(folderRoot, 'paper.pdf');
  try {
    fs.writeFileSync(sourcePath, 'source');
    const retrieval = createRetrieval({
      hasEmbeddingKey: () => true,
      vectorSearch: async () => [{
        fileName: path.join(folderRoot, '.paper.pdf.md'), chunkIndex: 0,
        content: 'derived evidence', heading: '', score: 1,
      }],
    });

    const result = await retrieval.search({ mode: 'semantic', query: 'evidence', folderRoot });

    assert.deepEqual(result.evidence, [{
      sourcePath, snippet: 'derived evidence', heading: '', locator: {}, score: 1, chunkIndex: 0,
    }]);
  } finally {
    fs.rmSync(folderRoot, { recursive: true, force: true });
  }
});
