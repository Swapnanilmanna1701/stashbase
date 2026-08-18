import { extractDocumentHeadings, outlineScrollTop, resolveCurrentDocumentHeading, type ProseMirrorDocument } from '@/features/documents/milkdown/headings';
import type { DocumentHeading } from '@/common/lib/documentOutline';

export type HeadingNodeView = {
  nodeDOM: (position: number) => Node | null;
  state: { doc: ProseMirrorDocument };
};

/** Scrolls to a retained document heading. The node resolver is supplied by
 * the live ProseMirror view so navigation can follow editor-owned state. */
export function scrollOutlineToHeading(
  host: HTMLElement | null,
  selectedHeading: DocumentHeading,
  view: HeadingNodeView | null,
  reducedMotion: boolean,
): boolean {
  if (!host || !view) return false;
  const currentHeadings = extractDocumentHeadings(view.state.doc);
  const heading = resolveCurrentDocumentHeading(currentHeadings, selectedHeading);
  if (!heading) return false;
  const headingElement = headingElementAtPosition(view, heading.position);
  if (!headingElement) return false;
  const scroller = documentScroller(host);
  const top = outlineScrollTop(
    scroller.getBoundingClientRect().top,
    scroller.scrollTop,
    headingElement.getBoundingClientRect().top,
  );
  scroller.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  return true;
}

export function headingElementAtPosition(view: HeadingNodeView | null, position: number): HTMLElement | null {
  const node = view?.nodeDOM(position) as HTMLElement | null | undefined;
  if (!node || !/^H[1-6]$/.test(node.tagName) || typeof node.getBoundingClientRect !== 'function') return null;
  return node;
}

/** Milkdown owns the visible document scrollbar; the shell only hosts it. */
export function documentScroller(host: HTMLElement) {
  return host.querySelector<HTMLElement>('.milkdown') ?? host;
}
