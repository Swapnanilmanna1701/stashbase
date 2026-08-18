import type { PDFPageProxy } from 'pdfjs-dist';

/** Fold the unicode variants pdfjs emits (curly quotes, en/em dashes,
 *  thin / zero-width spaces) to ASCII so chunk text and FindBar queries match
 *  the page's flattened string. */
export function foldPdfText(s: string): string {
  return s
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[  ​]/g, ' ');
}

function charLengthAt(text: string, offset: number): number {
  const first = text.charCodeAt(offset);
  if (first >= 0xd800 && first <= 0xdbff && offset + 1 < text.length) {
    const second = text.charCodeAt(offset + 1);
    if (second >= 0xdc00 && second <= 0xdfff) return 2;
  }
  return 1;
}

export interface FlatPage {
  flat: string;
  compact: string;
  compactToFlat: number[];
  items: PdfFlatItem[];
  itemStarts: number[];
  viewport1x: { width: number; height: number };
}

interface PdfFlatItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

export interface PdfHighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageHighlight {
  page: number;
  rects: PdfHighlightRect[];
}

/** Flatten a pdfjs page's text items into one folded string, tracking where
 *  each item starts so a match index maps back to a y-position. */
export async function flattenPageText(page: PDFPageProxy): Promise<FlatPage> {
  const tc = await page.getTextContent();
  type StrItem = { str: string; transform: number[]; width?: number; height?: number };
  const items: PdfFlatItem[] = [];
  const itemStarts: number[] = [];
  const segments: string[] = [];
  let pos = 0;
  let lastEnd = '';
  for (const it of tc.items) {
    if (!('str' in it) || typeof it.str !== 'string') continue;
    const raw = it.str;
    if (raw === '') continue;
    if (lastEnd && !/\s/.test(lastEnd) && !/^\s/.test(raw)) { segments.push(' '); pos += 1; }
    const piece = raw.replace(/\s+/g, ' ');
    itemStarts.push(pos);
    items.push(it as StrItem);
    segments.push(piece);
    pos += piece.length;
    lastEnd = piece.slice(-1);
  }
  const flat = foldPdfText(segments.join(''));
  const compactToFlat: number[] = [];
  let compact = '';
  for (let i = 0; i < flat.length;) {
    const len = charLengthAt(flat, i);
    const ch = flat.slice(i, i + len);
    if (!/\s/u.test(ch)) {
      compact += ch;
      compactToFlat.push(i);
    }
    i += len;
  }
  return {
    flat,
    compact,
    compactToFlat,
    items,
    itemStarts,
    viewport1x: page.getViewport({ scale: 1 }),
  };
}

export function cleanPdfSearchText(raw: string): string {
  return foldPdfText(raw)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)[*_]([^\s*_][^*_]*?)[*_](?=\s|$|[.,;:])/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPdfSearchText(raw: string): string {
  return cleanPdfSearchText(raw).replace(/\s+/g, '');
}

function textAnchors(raw: string, slice: number, minLen: number): string[] {
  const cleaned = cleanPdfSearchText(raw);
  if (!cleaned) return [];
  const mid = Math.max(0, Math.floor(cleaned.length / 2) - Math.floor(slice / 2));
  const tail = Math.max(0, cleaned.length - slice);
  return Array.from(new Set([
    cleaned.slice(0, slice),
    cleaned.slice(mid, mid + slice),
    cleaned.slice(tail),
  ].filter((a) => a.length >= Math.min(minLen, cleaned.length))));
}

function compactAnchors(raw: string, slice: number, minLen: number): string[] {
  const compacted = compactPdfSearchText(raw);
  if (!compacted) return [];
  const mid = Math.max(0, Math.floor(compacted.length / 2) - Math.floor(slice / 2));
  const tail = Math.max(0, compacted.length - slice);
  return Array.from(new Set([
    compacted.slice(0, slice),
    compacted.slice(mid, mid + slice),
    compacted.slice(tail),
  ].filter((a) => a.length >= Math.min(minLen, compacted.length))));
}

export function findPdfChunkMatch(fp: FlatPage, raw: string): { idx: number; length: number; score: number } | null {
  for (const anchor of textAnchors(raw, 60, 12)) {
    const idx = fp.flat.indexOf(anchor);
    if (idx >= 0) return { idx, length: anchor.length, score: 1000 + anchor.length };
  }
  for (const anchor of compactAnchors(raw, 40, 10)) {
    const compactIdx = fp.compact.indexOf(anchor);
    const idx = compactIdx >= 0 ? fp.compactToFlat[compactIdx] : undefined;
    if (idx !== undefined) return { idx, length: anchor.length, score: 800 + anchor.length };
  }

  const anchors = compactAnchors(raw, 18, 8);
  let best: { idx: number; length: number; score: number } | null = null;
  for (const anchor of anchors) {
    const compactIdx = fp.compact.indexOf(anchor);
    const idx = compactIdx >= 0 ? fp.compactToFlat[compactIdx] : undefined;
    if (idx === undefined) continue;
    const score = anchor.length;
    if (!best || score > best.score) best = { idx, length: anchor.length, score };
  }
  return best;
}

export function exactPageForHighlight(highlight: { pdfPage?: number }, numPages: number): number | null {
  if (numPages <= 0) return null;
  if (typeof highlight.pdfPage === 'number' && highlight.pdfPage > 0) {
    return Math.max(1, Math.min(numPages, Math.round(highlight.pdfPage)));
  }
  return null;
}

export function currentPdfPageForViewport({
  scrollTop,
  scrollHeight,
  clientHeight,
  markerY,
  pages,
}: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  markerY: number;
  pages: Array<{ page: number; top: number; bottom: number }>;
}): number {
  if (pages.length === 0) return 1;
  // A short final page cannot always cross the reading marker before the
  // scrollport reaches its limit. At the bottom, that final visible page is
  // nevertheless the user's reading position and must win deterministically.
  if (scrollTop + clientHeight >= scrollHeight - 1) return pages.at(-1)?.page ?? 1;
  let bestPage = pages[0].page;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const page of pages) {
    const topDistance = Math.abs(page.top - markerY);
    const insideDistance = page.top <= markerY && page.bottom >= markerY ? 0 : topDistance;
    if (insideDistance < bestDistance) {
      bestDistance = insideDistance;
      bestPage = page.page;
    }
  }
  return bestPage;
}

/** y-ratio (0 = page top, 1 = bottom) of the text item covering the
 *  flat-string index `idx` — for scroll-to-match positioning. */
export function yRatioForIndex(p: FlatPage, idx: number): number {
  const itemIdx = itemIndexForFlatIndex(p, idx);
  const m = p.items[itemIdx];
  const yFromTop = p.viewport1x.height - (m.transform[5] ?? 0);
  return Math.max(0, Math.min(1, yFromTop / p.viewport1x.height));
}

function itemIndexForFlatIndex(p: FlatPage, idx: number): number {
  let itemIdx = 0;
  for (let k = 0; k < p.itemStarts.length; k++) {
    if (p.itemStarts[k] > idx) break;
    itemIdx = k;
  }
  return itemIdx;
}

export function highlightRectsForMatch(p: FlatPage, idx: number, length: number): PdfHighlightRect[] {
  if (p.items.length === 0 || length <= 0) return [];
  const startItem = itemIndexForFlatIndex(p, idx);
  const endItem = itemIndexForFlatIndex(p, idx + length - 1);
  const groups: Array<{ top: number; bottom: number; left: number; right: number }> = [];
  const pageW = Math.max(1, p.viewport1x.width);
  const pageH = Math.max(1, p.viewport1x.height);

  for (let i = startItem; i <= endItem; i++) {
    const item = p.items[i];
    if (!item) continue;
    const x = Number(item.transform[4] ?? 0);
    const baselineY = Number(item.transform[5] ?? 0);
    const h = Math.max(8, Number(item.height ?? Math.abs(item.transform[3] ?? 0) ?? 10));
    const w = Math.max(2, Number(item.width ?? item.str.length * h * 0.45));
    const top = pageH - baselineY - h * 0.9;
    const bottom = pageH - baselineY + h * 0.25;
    const existing = groups.find((g) => Math.abs((g.top + g.bottom) / 2 - (top + bottom) / 2) < h * 0.8);
    if (existing) {
      existing.top = Math.min(existing.top, top);
      existing.bottom = Math.max(existing.bottom, bottom);
      existing.left = Math.min(existing.left, x);
      existing.right = Math.max(existing.right, x + w);
    } else {
      groups.push({ top, bottom, left: x, right: x + w });
    }
  }

  return groups.map((g) => {
    const padX = 4;
    const padY = 3;
    const left = Math.max(0, g.left - padX);
    const top = Math.max(0, g.top - padY);
    const right = Math.min(pageW, g.right + padX);
    const bottom = Math.min(pageH, g.bottom + padY);
    return {
      x: left / pageW,
      y: top / pageH,
      width: Math.max(0.01, (right - left) / pageW),
      height: Math.max(0.008, (bottom - top) / pageH),
    };
  });
}
