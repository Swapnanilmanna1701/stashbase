type TextPoint = { node: Text; offset: number };

const CHUNK_HIGHLIGHT = 'stashbase-chunk';
let chunkTimer: number | null = null;

export function applyChunkHighlight(doc: Document, raw: string, root: HTMLElement = doc.body): boolean {
  const range = findChunkRange(doc, raw, root);
  if (!range) return false;
  const win = doc.defaultView;
  const CSSNS = win as unknown as { CSS?: { highlights?: Map<string, unknown> } };
  const HL = win as unknown as { Highlight?: new (...r: Range[]) => unknown };
  if (CSSNS.CSS?.highlights && HL.Highlight) {
    ensureChunkHighlightStyle(doc);
    try {
      CSSNS.CSS.highlights.set(CHUNK_HIGHLIGHT, new HL.Highlight(range));
      scrollRangeIntoView(win, range);
      if (chunkTimer != null) window.clearTimeout(chunkTimer);
      chunkTimer = window.setTimeout(() => {
        CSSNS.CSS?.highlights?.delete(CHUNK_HIGHLIGHT);
        chunkTimer = null;
      }, 4000);
      return true;
    } catch {
      CSSNS.CSS.highlights.delete(CHUNK_HIGHLIGHT);
    }
  }
  return false;
}

function ensureChunkHighlightStyle(doc: Document): void {
  const id = 'stashbase-chunk-style';
  // Accent flash, same recipe as the PDF hit overlay (.pdf-page-highlight).
  // The token is resolved from the PARENT document root because `doc` may
  // be an iframe preview document (DOCX) that never receives the app
  // stylesheet, so a var() reference would not resolve there. Refreshing
  // the text on every call keeps an already-injected top-document style
  // (Markdown view) in sync after a theme flip.
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
  const css = `::highlight(stashbase-chunk) { background: rgba(${accent}, 0.18); ` +
    `box-shadow: 0 0 0 2px rgba(${accent}, 0.42); }`;
  const existing = doc.getElementById(id);
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = css;
  doc.head.appendChild(style);
}

function scrollRangeIntoView(win: Window | null, range: Range): void {
  if (!win) return;
  const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0)
    ?? range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;
  win.scrollBy({
    top: rect.top + rect.height / 2 - win.innerHeight / 2,
    left: rect.left + rect.width / 2 - win.innerWidth / 2,
    behavior: 'smooth',
  });
}

function findChunkRange(doc: Document, raw: string, root: HTMLElement): Range | null {
  const anchors = chunkAnchors(raw);
  if (anchors.length === 0 || !doc.body) return null;
  const flat = flattenDocumentText(doc, root);
  if (!flat.text) return null;
  for (const anchor of anchors) {
    const idx = flat.text.indexOf(anchor);
    if (idx < 0) continue;
    const start = flat.points[idx];
    const last = flat.points[idx + anchor.length - 1];
    if (!start || !last) continue;
    const range = doc.createRange();
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(last.node, last.offset + charLengthAt(last.node.data, last.offset));
      return range;
    } catch {
      continue;
    }
  }
  return null;
}

function flattenDocumentText(doc: Document, root: HTMLElement): { text: string; points: TextPoint[] } {
  let text = '';
  const points: TextPoint[] = [];
  let lastWasSpace = true;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = node.parentElement?.tagName;
      if (parent === 'SCRIPT' || parent === 'STYLE' || parent === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n: Node | null = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    for (let offset = 0; offset < node.data.length;) {
      const ch = node.data.slice(offset, offset + charLengthAt(node.data, offset));
      if (/\s/u.test(ch)) {
        if (!lastWasSpace) {
          text += ' ';
          points.push({ node, offset });
          lastWasSpace = true;
        }
      } else {
        text += ch;
        points.push({ node, offset });
        lastWasSpace = false;
      }
      offset += ch.length;
    }
  }
  return { text: text.trim(), points };
}

function chunkAnchors(raw: string): string[] {
  const cleaned = cleanChunkText(raw);
  if (!cleaned) return [];
  const slice = 80;
  const mid = Math.max(0, Math.floor(cleaned.length / 2) - Math.floor(slice / 2));
  const tail = Math.max(0, cleaned.length - slice);
  return Array.from(new Set([
    cleaned.slice(0, slice),
    cleaned.slice(mid, mid + slice),
    cleaned.slice(tail),
  ].map((s) => normalizeChunkText(s)).filter((s) => s.length >= Math.min(12, cleaned.length))));
}

function cleanChunkText(raw: string): string {
  return normalizeChunkText(raw)
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

function normalizeChunkText(text: string): string {
  return text
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[  ​]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function charLengthAt(text: string, offset: number): number {
  const code = text.charCodeAt(offset);
  return code >= 0xd800 && code <= 0xdbff && offset + 1 < text.length ? 2 : 1;
}
