import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { filesystemPath } from '../filesystem-path.ts';
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

test('Retrieval distinguishes exhausted hosted quota without invoking vector search', async () => {
  let called = false;
  const retrieval = createRetrieval({
    hasEmbeddingKey: () => false,
    embeddingUnavailableReason: () => 'hosted-quota-exhausted',
    vectorSearch: async () => {
      called = true;
      return [];
    },
  });

  const result = await retrieval.search({ mode: 'semantic', query: 'architecture' });
  assert.deepEqual(result.availability, { state: 'unavailable', reason: 'hosted-quota-exhausted' });
  assert.equal(called, false);
});

test('Retrieval normalizes keyword matches into flat visible-source evidence', async () => {
  const folderRoot = filesystemPath.absolute('/library');
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

  const result = await retrieval.search({ mode: 'keyword', query: 'architecture', folderRoot });

  assert.deepEqual(result, {
    evidence: [
      { sourcePath: filesystemPath.join(folderRoot, 'notes/brief.md'), snippet: 'System architecture', ranges: [[7, 19]], sourceMatchCount: 2, locator: { line: 4 } },
      { sourcePath: filesystemPath.join(folderRoot, 'notes/brief.md'), snippet: 'architecture diagram', ranges: [[0, 12]], sourceMatchCount: 2, locator: { line: 9 } },
    ],
    availability: { state: 'ready' },
    truncated: false,
  });
});

test('Retrieval applies top_k to keyword evidence and reports truncation', async () => {
  const retrieval = createRetrieval({
    keywordSearch: async () => ({
      files: [{
        path: 'notes/brief.md', totalMatches: 2,
        matches: [
          { line: 4, text: 'first match', ranges: [[0, 5]] },
          { line: 9, text: 'second match', ranges: [[0, 6]] },
        ],
      }],
      truncated: false,
    }),
  });

  const result = await retrieval.search({
    mode: 'keyword',
    query: 'match',
    folderRoot: '/library',
    topK: 1,
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.locator.line, 4);
  assert.deepEqual(result.availability, { state: 'partial', reason: 'truncated' });
  assert.equal(result.truncated, true);
});

test('Retrieval preserves semantic source identity and source-safe locators', async () => {
  const folderRoot = filesystemPath.absolute('/library');
  const sourcePath = filesystemPath.join(folderRoot, 'paper.pdf');
  const retrieval = createRetrieval({
    hasEmbeddingKey: () => true,
    vectorSearch: async () => [{
      fileName: sourcePath, chunkIndex: 3, content: 'derived evidence', heading: 'Results',
      startLine: 42, endLine: 45, pdfPage: 7, score: 0.9,
    }],
  });

  const result = await retrieval.search({ mode: 'semantic', query: 'evidence', folderRoot });

  assert.deepEqual(result.evidence, [{
    sourcePath, snippet: 'derived evidence', heading: 'Results',
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

  const result = await retrieval.search({
    mode: 'semantic',
    query: 'evidence',
    types: ['pdf', 'docx', 'spreadsheets'],
  });

  assert.deepEqual(extensions, ['.pdf', '.docx', '.xlsx']);
  assert.deepEqual(result.evidence, []);
});

test('Retrieval preserves XLSX source identity for keyword and semantic evidence', async () => {
  const folderRoot = filesystemPath.absolute('/library');
  const sourcePath = filesystemPath.join(folderRoot, 'quarterly.xlsx');
  const keyword = createRetrieval({
    keywordSearch: async () => ({
      files: [{ path: 'quarterly.xlsx', totalMatches: 1, matches: [{ line: 7, text: 'B2: Projected revenue', ranges: [[4, 13]] }] }],
      truncated: false,
    }),
  });
  const keywordResult = await keyword.search({ mode: 'keyword', query: 'Projected', folderRoot, types: ['spreadsheets'] });
  assert.equal(keywordResult.evidence[0]?.sourcePath, sourcePath);
  assert.deepEqual(keywordResult.evidence[0]?.locator, { line: 7 });

  const semantic = createRetrieval({
    hasEmbeddingKey: () => true,
    vectorSearch: async () => [{ fileName: sourcePath, chunkIndex: 0, content: 'Projected revenue', heading: 'Forecast', startLine: 7, score: 0.95 }],
  });
  const semanticResult = await semantic.search({ mode: 'semantic', query: 'Projected', folderRoot, types: ['spreadsheets'] });
  assert.equal(semanticResult.evidence[0]?.sourcePath, sourcePath);
  assert.equal(semanticResult.evidence[0]?.heading, 'Forecast');
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
      sourcePath: filesystemPath.absolute(sourcePath), snippet: 'derived evidence', heading: '', locator: {}, score: 1, chunkIndex: 0,
    }]);
  } finally {
    fs.rmSync(folderRoot, { recursive: true, force: true });
  }
});
