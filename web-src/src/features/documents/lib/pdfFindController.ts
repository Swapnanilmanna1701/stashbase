/**
 * Cmd+F find driver for the PDF viewer — registered with the FindBar so the
 * user can search PDFs the same way they search MD / HTML / code. It scans
 * pdfjs text content across all pages, builds an in-memory list of match
 * positions, and reports the active match on setQuery / next / prev; the
 * viewer scrolls to it and paints its highlight rects. The FindBar's
 * "N of M" counter carries the navigation.
 *
 * Page text arrives asynchronously, so a scan is cancellable: `dispose`
 * stops an in-flight rebuild when the viewer unmounts or the document
 * changes, instead of paging through a destroyed pdfjs document.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { escapeRegExp } from '@/common/lib/regex';
import type { FindController, FindOptions, MatchInfo } from '@/store/contexts/AppContext';
import {
  flattenPageText,
  foldPdfText,
  highlightRectsForMatch,
  yRatioForIndex,
  type FlatPage,
  type PdfHighlightRect,
} from '@/features/documents/lib/pdfText';

export interface PdfFindMatch {
  page: number;
  yRatio: number;
  rects: PdfHighlightRect[];
}

/** Visit every page's flattened text in order — the one page-scan loop
 *  shared by the find rebuild below and the viewer's chunk-highlight
 *  search. `cancelled` is polled before each page so a disposed caller
 *  stops paging through a destroyed pdfjs document; `onPageText` may
 *  return `false` to stop early (e.g. a good-enough chunk match). Pages
 *  that fail to load or flatten are skipped, never fatal. */
export async function scanPages(
  doc: PDFDocumentProxy,
  numPages: number,
  onPageText: (page: number, fp: FlatPage) => boolean | void,
  cancelled: () => boolean,
): Promise<void> {
  for (let i = 0; i < numPages; i++) {
    if (cancelled()) return;
    try {
      const page = await doc.getPage(i + 1);
      const fp = await flattenPageText(page);
      if (onPageText(i + 1, fp) === false) return;
    } catch { /* skip page */ }
  }
}

/** All matches of `needle` (already folded and trimmed) in one page's flat
 *  text, as flat-string offsets. Pure — the unit-testable core of the scan. */
export function findFlatMatches(
  flat: string,
  needle: string,
  { wholeWord, caseSensitive }: FindOptions,
): Array<{ idx: number; length: number }> {
  const hits: Array<{ idx: number; length: number }> = [];
  if (wholeWord) {
    const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, caseSensitive ? 'g' : 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null) {
      hits.push({ idx: m.index, length: m[0].length });
      if (re.lastIndex === m.index) re.lastIndex += 1;
    }
    return hits;
  }
  const needleCmp = caseSensitive ? needle : needle.toLowerCase();
  const flatCmp = caseSensitive ? flat : flat.toLowerCase();
  let from = 0;
  while (true) {
    const idx = flatCmp.indexOf(needleCmp, from);
    if (idx === -1) break;
    hits.push({ idx, length: needle.length });
    from = idx + needleCmp.length;
  }
  return hits;
}

/** Make the FindController the viewer registers. `onActiveMatch` fires for
 *  every landed match (first hit of a query, next, prev); `onClose` fires
 *  when the FindBar closes so the viewer can drop its highlight overlay. */
export function makePdfFindController({
  doc,
  numPages,
  onActiveMatch,
  onClose,
}: {
  doc: PDFDocumentProxy;
  numPages: number;
  onActiveMatch: (match: PdfFindMatch) => void;
  onClose: () => void;
}): { controller: FindController; dispose: () => void } {
  let cancelled = false;
  let generation = 0;
  let matches: PdfFindMatch[] = [];
  let current = 0;

  /** Scan into a local list and commit only if no newer setQuery started
   *  meanwhile — concurrent rebuilds otherwise interleave pushes into the
   *  shared array and the slower query's matches win. Returns null when
   *  superseded so the caller neither commits nor jumps. */
  async function rebuild(query: string, opts: FindOptions): Promise<PdfFindMatch[] | null> {
    const gen = ++generation;
    const found: PdfFindMatch[] = [];
    const needle = foldPdfText(query).trim();
    if (needle) {
      await scanPages(doc, numPages, (page, fp) => {
        for (const hit of findFlatMatches(fp.flat, needle, opts)) {
          found.push({
            page,
            yRatio: yRatioForIndex(fp, hit.idx),
            rects: highlightRectsForMatch(fp, hit.idx, hit.length),
          });
        }
      }, () => cancelled || gen !== generation);
    }
    return gen === generation ? found : null;
  }

  function jumpTo(index: number): MatchInfo {
    current = index;
    onActiveMatch(matches[current]);
    return { current: current + 1, total: matches.length };
  }

  const controller: FindController = {
    setQuery: async (query, opts) => {
      const found = await rebuild(query, opts);
      if (found === null) return { current: 0, total: 0 }; // superseded — the newer call owns the counter
      matches = found;
      current = 0;
      if (matches.length === 0) return { current: 0, total: 0 };
      return jumpTo(0);
    },
    next: () => {
      if (matches.length === 0) return { current: 0, total: 0 };
      return jumpTo((current + 1) % matches.length);
    },
    prev: () => {
      if (matches.length === 0) return { current: 0, total: 0 };
      return jumpTo((current - 1 + matches.length) % matches.length);
    },
    close: () => {
      generation++; // an in-flight rebuild must not repopulate a closed bar
      matches = [];
      current = 0;
      onClose();
    },
  };

  return { controller, dispose: () => { cancelled = true; generation++; } };
}
