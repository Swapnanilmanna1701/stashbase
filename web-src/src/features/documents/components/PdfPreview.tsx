import { useEffect, useMemo, useRef, useState } from 'react';
import '@/features/documents/documents.css';
import { versionedAssetUrl } from '@/common/api/api';
import { useAppActions, useWorkspace } from '@/store/contexts/AppContext';
import { usePdfDocument } from '@/features/documents/hooks/usePdfDocument';
import { usePdfFindRegistration } from '@/features/documents/hooks/usePdfFindRegistration';
import { usePdfPageTracking } from '@/features/documents/hooks/usePdfPageTracking';
import { usePdfZoom, PDF_MAX_SCALE } from '@/features/documents/hooks/usePdfZoom';
import type { PdfPreparationStatus } from '@/features/documents/hooks/usePdfPreparation';
import { scanPages } from '@/features/documents/lib/pdfFindController';
import {
  cleanPdfSearchText,
  exactPageForHighlight,
  findPdfChunkMatch,
  highlightRectsForMatch,
  yRatioForIndex,
  type FlatPage,
  type PdfPageHighlight,
} from '@/features/documents/lib/pdfText';
import { PdfChromePortal } from './PdfChrome';
import { PdfPage } from './PdfPage';

/**
 * PDF viewer built on pdfjs-dist's programmatic API. Renders every
 * page as a canvas in a single scrollable column so search /
 * chunk-highlight scrolling lands on the right page without virtual-
 * scroll bookkeeping. Pages render lazily once they enter (or come
 * within one viewport of) the visible area — bundle size win on
 * large papers.
 *
 * Four machines, one per hook, and this component is what wires them
 * together: the document load (`usePdfDocument`), zoom (`usePdfZoom`),
 * which page the reader is on (`usePdfPageTracking`), Find registration
 * (`usePdfFindRegistration`), plus the page canvases (`PdfPage`).
 *
 * What stays HERE is the scrolling — one owner, `scrollToTarget` — and
 * the search integration that the out-of-the-box pdfjs viewer.html does
 * not give us cleanly: when a search hit on a PDF-derived HTML file
 * co-opens the PDF, the pending highlight's chunk text is searched
 * across pages so the PDF jumps to the same passage.
 *
 * Preparation is deliberately absent: the failure banner and its
 * Reprocess command arrive as `status` / `onRetry` props, so nothing in
 * the viewer performs a mutating API call.
 */
export function PdfPreview({
  name,
  status,
  onRetry,
  retryPending = false,
}: {
  name: string;
  status?: PdfPreparationStatus | null;
  onRetry?: () => void;
  retryPending?: boolean;
}) {
  const state = useWorkspace();
  const { activeTab } = state;
  const { actions } = useAppActions();
  const { consumePendingHighlight, registerFindController, updateTabPdfPage } = actions;
  const pendingHighlight = activeTab?.pendingHighlight ?? null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageHighlight, setPageHighlight] = useState<PdfPageHighlight | null>(null);

  // Stable URL for this PDF + cache-bust so reopening after a Retry
  // re-fetches the binary instead of the stale 404 / failed body.
  const sourceVersion = activeTab?.file?.name === name ? activeTab.file.version ?? '' : '';
  const sourceFolder = activeTab?.file?.name === name ? activeTab.file.folder : undefined;
  const fileUrl = useMemo(
    () => versionedAssetUrl(name, sourceVersion, sourceFolder),
    [name, sourceVersion, sourceFolder],
  );

  const { doc, numPages, pageMetrics, error } = usePdfDocument(fileUrl);
  const zoom = usePdfZoom({ containerRef, pageMetrics, resetKey: fileUrl });
  const { scale, autoFit, fitScale } = zoom;
  const {
    currentPage,
    setCurrentPage,
    beginProgrammaticScroll,
    persistPage,
    initialScrollDone,
  } = usePdfPageTracking({
    containerRef,
    doc,
    numPages,
    scale,
    resetKey: fileUrl,
    activeTab,
    updateTabPdfPage,
  });

  // A new source drops the previous document's overlay.
  useEffect(() => {
    setPageHighlight(null);
  }, [fileUrl]);

  /** Single scroll owner for every jump-the-viewer path: page jumps, chunk-
   *  highlight landings, and find-match navigation. `anchor` is the fraction
   *  of the viewport height kept above the landing spot; `yRatio` (0 = page
   *  top, 1 = bottom) picks the spot inside the page. Passing `highlight`
   *  (null included) swaps the highlight overlay; omitting it leaves the
   *  overlay untouched. Returns false — and changes nothing — when the page
   *  element is not in the DOM. */
  function scrollToTarget(
    page: number,
    {
      yRatio = 0,
      anchor,
      behavior = 'smooth',
      highlight,
    }: {
      yRatio?: number;
      anchor: number;
      behavior?: ScrollBehavior;
      highlight?: PdfPageHighlight | null;
    },
  ): boolean {
    const root = containerRef.current;
    const target = root?.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
    if (!root || !target) return false;
    if (highlight !== undefined) setPageHighlight(highlight);
    // During a smooth jump the viewport still crosses the old page. Keep that
    // transient geometry from overwriting the requested tab position before
    // the animation reaches its destination (or the user switches tabs).
    beginProgrammaticScroll(page, behavior);
    setCurrentPage(page);
    root.scrollTo({
      top: Math.max(0, target.offsetTop + yRatio * target.offsetHeight - root.clientHeight * anchor),
      behavior,
    });
    return true;
  }

  function scrollToPage(pageNumber: number, behavior: ScrollBehavior = 'smooth') {
    if (numPages <= 0) return;
    const targetPage = Math.max(1, Math.min(numPages, Math.round(pageNumber)));
    if (!scrollToTarget(targetPage, { anchor: 0.08, behavior })) return;
    // Direct navigation must persist before the next pointer/keyboard event.
    // Waiting for the passive currentPage effect lets an immediate tab switch
    // unmount the viewer before the requested page reaches tab state.
    persistPage(targetPage);
  }

  useEffect(() => {
    if (!doc || !pageMetrics || numPages <= 0 || initialScrollDone.current) return;
    const root = containerRef.current;
    if (!root || root.clientWidth <= 0) return;

    // Wait for the auto-fit scale to settle before performing the initial scroll jump
    if (autoFit && Math.abs(scale - fitScale()) > 0.001) return;

    const targetPage = activeTab?.pdfPage ?? 1;
    if (targetPage > 1 && targetPage <= numPages) {
      const frame = requestAnimationFrame(() => {
        scrollToPage(targetPage, 'auto');
        initialScrollDone.current = true;
      });
      return () => cancelAnimationFrame(frame);
    } else {
      initialScrollDone.current = true;
    }
  }, [doc, pageMetrics, numPages, activeTab?.pdfPage, scale, autoFit]);

  // Search for the chunk text across pages and scroll directly to
  // the matched paragraph (not just the page top).
  //
  // Two robustness measures, on top of the per-page placeholder
  // trick that keeps target.offsetTop stable:
  //   1. Both the chunk text and the pdfjs flat text get stripped
  //      of markdown noise (bold / italic / links / code) and have
  //      Unicode variants (smart quotes, dash variants) folded to
  //      ASCII. Without this, a chunk like "**Figure 1:** Training
  //      loss" never matches the PDF's "Figure 1: Training loss".
  //   2. If the first ~60 chars don't hit, we retry with a slice
  //      from the middle and one from the end. PDF column boundaries
  //      and pymupdf4llm's paragraph reflowing can leave the head
  //      of a chunk unrecognisable in pdfjs's reading order.
  useEffect(() => {
    if (!doc || !pendingHighlight?.chunkText) return;
    let cancelled = false;
    const cleaned = cleanPdfSearchText(pendingHighlight.chunkText);
    if (!cleaned) { consumePendingHighlight(); return; }

    void (async () => {
      type ChunkMatch = { page: number; idx: number; length: number; score: number; fp: FlatPage };
      // Widened initializer: TS cannot see the closure assignment below,
      // so a bare `null` would narrow every later read to `never`.
      let best = null as ChunkMatch | null;
      await scanPages(doc, numPages, (page, fp) => {
        const match = findPdfChunkMatch(fp, pendingHighlight.chunkText);
        if (!match) return;
        if (!best || match.score > best.score) {
          best = { page, idx: match.idx, length: match.length, score: match.score, fp };
          if (match.score >= 800) return false;
        }
      }, () => cancelled);
      const found = best;
      if (cancelled || !found) {
        if (!cancelled) {
          const fallbackPage = exactPageForHighlight(pendingHighlight, numPages);
          if (fallbackPage && scrollToTarget(fallbackPage, { anchor: 0.12, highlight: null })) {
            consumePendingHighlight();
          }
        }
        return;
      }
      const yRatio = yRatioForIndex(found.fp, found.idx);
      const rects = highlightRectsForMatch(found.fp, found.idx, found.length);
      scrollToTarget(found.page, {
        yRatio,
        anchor: 0.3,
        highlight: rects.length > 0 ? { page: found.page, rects } : null,
      });
      consumePendingHighlight();
    })();
    return () => { cancelled = true; };
  }, [doc, numPages, pendingHighlight, consumePendingHighlight]);

  // Cmd+F over the open document. The hook owns the registration's
  // lifetime; the two callbacks it takes are how a find match reaches the
  // one scroll owner above.
  usePdfFindRegistration({
    doc,
    numPages,
    registerFindController,
    onActiveMatch: (match) => {
      scrollToTarget(match.page, {
        yRatio: match.yRatio,
        anchor: 0.3,
        highlight: match.rects.length > 0 ? { page: match.page, rects: match.rects } : null,
      });
    },
    onClose: () => setPageHighlight(null),
  });

  return (
    /* Light surface keeps continuity with the rest of the app — the white
     * PDF page + shadow gives enough "paper on a desk" contrast without a
     * heavy dark backdrop. No top padding of its own: MainPane already
     * reserves the chrome band this viewer's controls portal into, so
     * padding here would only push the first page further down the pane.
     *
     * The top hairline is what lets that band stay on the base surface
     * like the tab that merges into it. Tint the band instead and a
     * fitted page — which fills the pane edge to edge — puts a grey
     * stripe between two whites; leave it untinted with no rule and
     * scrolling text is clipped at an invisible line. One stroke does
     * both jobs. `box-border` because Preflight is off here, so the
     * border would otherwise grow the pane past its row. */
    <div className="relative box-border flex h-full w-full flex-col items-center overflow-auto border-t border-border bg-pane" ref={containerRef}>
      {error && <div className="p-4 text-base text-destructive">Failed to open PDF: {error}</div>}
      {!error && !doc && <div className="p-4 text-base text-muted-foreground">Loading PDF…</div>}
      <PdfChromePortal
        scale={scale}
        autoFit={autoFit}
        canZoomOut={zoom.canZoomOut}
        canZoomIn={zoom.canZoomIn}
        currentPage={currentPage}
        numPages={numPages}
        status={status ?? null}
        retryPending={retryPending}
        onRetry={onRetry}
        onFit={zoom.fit}
        onActualSize={zoom.actualSize}
        onZoomOut={zoom.zoomOut}
        onZoomIn={zoom.zoomIn}
        // A numbered jump is a direct navigation, not continuous reading.
        // Move synchronously so the scroll listener cannot observe the old
        // page during a smooth-scroll frame and overwrite the requested page.
        onJumpToPage={(page) => scrollToPage(page, 'auto')}
      />
      {/* The gap above the first page follows the page's own margins.
        * Fitted, the sheet runs edge to edge and has none, so a top gap
        * would be a stripe of canvas the user never asked for — and one
        * that collapses the moment they scroll, since scrolled content is
        * clipped at this container's top edge either way. Zoomed away
        * from fit, the sheet is an object floating on canvas with room on
        * both sides, and leaving it glued to the toolbar's rule reads as
        * cropped; it then takes the same 10px it takes between pages.
        * (`autoFit` fills the width unless the fit scale hit the zoom
        * ceiling, which only a page narrower than a third of the pane
        * can do.) */}
      <div
        className={
          'flex w-full flex-col items-center gap-2.5 pb-10'
          + (autoFit && scale < PDF_MAX_SCALE - 0.001 ? '' : ' pt-2.5')
        }
      >
        {doc && Array.from({ length: numPages }, (_, i) => (
          <PdfPage
            key={`p-${i}`}
            doc={doc}
            pageIndex={i}
            scale={scale}
            placeholderHeight={pageMetrics ? pageMetrics.height * scale : 800}
            highlight={pageHighlight?.page === i + 1 ? pageHighlight : null}
          />
        ))}
      </div>
    </div>
  );
}
