/**
 * Search result shapes returned to the renderer. The filter vocabulary a
 * request carries lives in `search-types.ts`; this file is what comes back.
 *
 * Semantic and keyword search return different shapes on purpose. A
 * semantic hit is a chunk with a similarity score and no notion of a line;
 * a keyword hit is a set of character ranges within specific lines, which
 * is what lets the renderer highlight in place. Nothing useful is gained by
 * forcing them into one type.
 */

export interface SearchHit {
  /** The indexer emits an absolute POSIX source path here; the search route
   *  remaps it to a folder-relative display path before responding, so the
   *  renderer never sees the absolute spelling. */
  fileName: string;
  chunkIndex: number;
  /** Indexed chunk body — already heading-prefixed for markdown / html. */
  content: string;
  /** Heading breadcrumb (`A › B › C`), or empty if the chunker didn't tag one. */
  heading: string;
  /** 1-based source-line offsets — useful for "jump to line N" UX. */
  startLine?: number;
  endLine?: number;
  /** For hits remapped from a PDF-derived hidden markdown note:
   *  best-known 1-based PDF page. Present when the derived note carries
   *  page markers. */
  pdfPage?: number;
  /** Hybrid (RRF) score, higher = better. Scale is opaque; compare within a
   *  single response only. */
  score: number;
}

export interface KeywordMatch {
  line: number;
  text: string;
  ranges: Array<[number, number]>;
  pdfPage?: number;
  /** Exact transcript position retained independently from display snippet
   * truncation. Present only for AppData-derived audio Markdown. */
  audioTimestampMs?: number;
}

export interface KeywordHitFile {
  path: string;
  matches: KeywordMatch[];
  totalMatches: number;
}

/**
 * The `/api/keyword-search` response. `query` and `folder` are echoed back
 * by the route so a late response can be matched to the request that asked
 * for it; `folder` is the absolute folder root, not a display label.
 *
 * The server's own scan produces only `files`/`totalMatches`/`truncated` —
 * see `KeywordScanResult` in `server/search-display.ts`, which is that
 * narrower internal shape and deliberately not this type.
 */
export interface KeywordSearchResult {
  query: string;
  folder: string;
  files: KeywordHitFile[];
  totalMatches: number;
  truncated: boolean;
}

/** One keyword-hit file from the library-wide sweep: `folder` is the
 *  member folder that owns it, so a row can be opened in its own identity. */
export interface LibraryKeywordFile extends KeywordHitFile {
  folder: string;
}

export interface LibraryKeywordSearchResult {
  files: LibraryKeywordFile[];
  totalMatches: number;
  truncated: boolean;
}
