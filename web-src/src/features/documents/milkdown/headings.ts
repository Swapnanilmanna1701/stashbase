import type { DocumentHeading } from '@/common/lib/documentOutline';

export type ProseMirrorDocument = { descendants: (visit: (node: { type: { name: string }; attrs: { level?: number }; textContent: string }, position: number) => void) => void };
const headingNodes = new WeakMap<DocumentHeading, object>();

export function headingSlug(text: string): string {
  return text.trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}_ -]/gu, '')
    .trim().replace(/\s+/g, '-') || 'section';
}

export function extractDocumentHeadings(doc: ProseMirrorDocument): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  const used = new Map<string, number>();
  doc.descendants((node, position) => {
    if (node.type.name !== 'heading') return;
    const text = node.textContent.trim();
    const base = headingSlug(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const heading = { id: seen === 0 ? base : `${base}-${seen}`, level: Number(node.attrs.level) || 1, text, position };
    headingNodes.set(heading, node);
    headings.push(heading);
  });
  return headings;
}

/** Maps an outline entry retained across a React render to its latest
 * ProseMirror position. Unchanged nodes keep identity across transactions. */
export function resolveCurrentDocumentHeading(current: DocumentHeading[], selected: DocumentHeading): DocumentHeading | null {
  const selectedNode = headingNodes.get(selected);
  const identityMatches = selectedNode
    ? current.filter((heading) => headingNodes.get(heading) === selectedNode)
    : [];
  if (identityMatches.length === 1) return identityMatches[0];
  if (identityMatches.length > 1) {
    return identityMatches.find((heading) => sameOutlineEntry(heading, selected, true))
      ?? identityMatches.find((heading) => sameOutlineEntry(heading, selected, false))
      ?? null;
  }
  return current.find((heading) => sameOutlineEntry(heading, selected, true)) ?? null;
}

function sameOutlineEntry(current: DocumentHeading, selected: DocumentHeading, includePosition: boolean): boolean {
  return current.id === selected.id
    && current.level === selected.level
    && current.text === selected.text
    && (!includePosition || current.position === selected.position);
}

/** Compute the document-scroller offset for an outline selection. */
export function outlineScrollTop(scrollerTop: number, scrollTop: number, headingTop: number): number {
  return Math.max(0, scrollTop + headingTop - scrollerTop);
}

export function activeHeadingId(entries: DocumentHeading[], positions: Array<{ id: string; top: number }>, threshold: number): string | null {
  let active = entries[0]?.id ?? null;
  for (const position of positions) {
    if (position.top <= threshold) active = position.id;
    else break;
  }
  return active;
}
