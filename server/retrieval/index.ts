/**
 * Source-oriented retrieval.
 *
 * Keyword and semantic implementations stay private adapters. Callers receive
 * one flat evidence model keyed by the visible, absolute source path; prepared
 * representations never cross this seam.
 */
import { getApiKey } from '../app-config.ts';
import { searchExtensionsForTypes } from '../format.ts';
import { filesystemPath } from '../filesystem-path.ts';
import { runKeywordSearch, type KeywordSearchOpts } from '../keyword-search.ts';
import type { SearchHit } from '../indexer.ts';
import { indexer } from '../state.ts';
import type { SearchTypeCategory } from '../../shared/search-types.ts';
import { semanticEvidence } from './semantic.ts';
import { visibleKeywordEvidence } from './keyword.ts';

export { keywordFilesFromEvidence, semanticHitsFromEvidence, type SourceEvidence, type SourceLocator } from './evidence.ts';

export type RetrievalMode = 'keyword' | 'semantic';
export type RetrievalAvailability =
  | { state: 'ready' }
  | { state: 'partial'; reason: 'truncated' }
  | { state: 'unavailable'; reason: 'embedding-key-required' };

export interface RetrievalQuery {
  mode: RetrievalMode;
  query: string;
  folderRoot?: string;
  pathPrefix?: string;
  types?: readonly SearchTypeCategory[];
  topK?: number;
  caseStrict?: boolean;
  wholeWord?: boolean;
}

export interface RetrievalResult {
  evidence: import('./evidence.ts').SourceEvidence[];
  availability: RetrievalAvailability;
  truncated: boolean;
}

export interface RetrievalDependencies {
  hasEmbeddingKey: () => boolean;
  vectorSearch: (query: string, topK: number, folderRoot?: string, pathPrefix?: string, extensions?: string[]) => Promise<SearchHit[]>;
  keywordSearch: (query: string, folderRoot: string, opts: KeywordSearchOpts) => Promise<{ files: import('../search-display.ts').KeywordHitFile[]; truncated: boolean }>;
}

const productionDependencies: RetrievalDependencies = {
  hasEmbeddingKey: () => Boolean(getApiKey()),
  vectorSearch: (query, topK, folderRoot, pathPrefix, extensions) =>
    indexer.search(query, topK, folderRoot, pathPrefix, extensions),
  keywordSearch: runKeywordSearch,
};

/** The retrieval module interface shared by UI routes and library/MCP operations. */
export interface Retrieval {
  search(query: RetrievalQuery): Promise<RetrievalResult>;
}

export function createRetrieval(overrides: Partial<RetrievalDependencies> = {}): Retrieval {
  const deps = { ...productionDependencies, ...overrides };
  return {
    async search(query) {
      const text = query.query.trim();
      if (!text) throw new Error('query required');
      if (query.mode === 'semantic') {
        if (!deps.hasEmbeddingKey()) {
          return { evidence: [], availability: { state: 'unavailable', reason: 'embedding-key-required' }, truncated: false };
        }
        const hits = await deps.vectorSearch(
          text,
          query.topK ?? 8,
          query.folderRoot,
          query.pathPrefix,
          searchExtensionsForTypes(query.types ?? []) ?? undefined,
        );
        return { evidence: semanticEvidence(hits, query.folderRoot), availability: { state: 'ready' }, truncated: false };
      }

      if (!query.folderRoot) throw new Error('keyword retrieval requires a folder scope');
      const result = await deps.keywordSearch(text, query.folderRoot, {
        caseStrict: query.caseStrict === true,
        wholeWord: query.wholeWord === true,
        pathPrefix: query.pathPrefix
          ? (filesystemPath.relative(query.folderRoot, query.pathPrefix) ?? undefined)
          : undefined,
        types: query.types,
      });
      return {
        evidence: visibleKeywordEvidence(result.files, query.folderRoot),
        availability: result.truncated ? { state: 'partial', reason: 'truncated' } : { state: 'ready' },
        truncated: result.truncated,
      };
    },
  };
}
