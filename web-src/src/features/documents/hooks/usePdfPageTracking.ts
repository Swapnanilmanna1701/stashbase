import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { currentPdfPageForViewport } from '@/features/documents/lib/pdfText';
import type { Tab } from '@/store/state/state';

export interface PdfPageTracking {
  /** The page the reader is on — from the viewport while scrolling, or
   *  from the scroll owner during a programmatic jump. */
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  /**
   * Announced by the viewer's single scroll owner before it scrolls.
   *
   * A *smooth* jump claims its destination page until the viewport arrives
   * (or `scrollend` fires): during the animation the viewport still crosses
   * every page in between, and that transient geometry would otherwise
   * overwrite the requested position in tab state before the jump lands. An
   * instant (`auto`) jump has no in-between, so it claims nothing and the
   * next viewport reading publishes immediately.
   */
  beginProgrammaticScroll: (page: number, behavior: ScrollBehavior) => void;
  /**
   * Write a page to tab state now, without waiting for the passive
   * `currentPage` effect. Direct navigation needs this: waiting for the
   * effect lets an immediate tab switch unmount the viewer before the
   * requested page reaches tab state.
   */
  persistPage: (page: number) => void;
  /** False until the restore-to-saved-page jump has run for this source.
   *  Viewport tracking stays silent until then, so the restore is not
   *  fought by a scroll event for page 1. */
  initialScrollDone: RefObject<boolean>;
}

/**
 * Which page the reader is on, and keeping the tab's remembered page in
 * step with it. Owns the scroll/resize listeners and the programmatic-jump
 * bail; it never scrolls anything itself — the viewer keeps a single scroll
 * owner and hands this hook only the refs that protect it.
 */
export function usePdfPageTracking({
  containerRef,
  doc,
  numPages,
  scale,
  resetKey,
  activeTab,
  updateTabPdfPage,
}: {
  containerRef: RefObject<HTMLElement | null>;
  doc: PDFDocumentProxy | null;
  numPages: number;
  scale: number;
  resetKey: string;
  activeTab: Tab | null;
  updateTabPdfPage: (tabId: string, page: number) => void;
}): PdfPageTracking {
  const [currentPage, setCurrentPage] = useState(activeTab?.pdfPage ?? 1);
  const programmaticPageRef = useRef<number | null>(null);
  const initialScrollDone = useRef(false);
  // The saved page is read at reset time only — a later edit to it must not
  // yank the reader back, which a dependency on the value would do.
  const savedPageRef = useLatestRef(activeTab?.pdfPage ?? 1);

  // A new source starts from the page its tab remembers, and owes that
  // restore one initial jump.
  useEffect(() => {
    setCurrentPage(savedPageRef.current);
    initialScrollDone.current = false;
    // `savedPageRef` is a stable ref object — `resetKey` is the only thing
    // here that can actually change.
  }, [resetKey, savedPageRef]);

  useEffect(() => {
    if (activeTab && activeTab.file?.format === 'pdf' && activeTab.pdfPage !== currentPage) {
      updateTabPdfPage(activeTab.id, currentPage);
    }
  }, [currentPage, activeTab?.id, activeTab?.file?.format, activeTab?.pdfPage, updateTabPdfPage]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || numPages <= 0) return;
    let frame = 0;
    const updateCurrentPage = () => {
      frame = 0;
      if (!initialScrollDone.current) return;
      const rootRect = root.getBoundingClientRect();
      const markerY = rootRect.top + Math.min(root.clientHeight * 0.35, 160);
      const pages = root.querySelectorAll<HTMLElement>('[data-page]');
      const bestPage = currentPdfPageForViewport({
        scrollTop: root.scrollTop,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        markerY,
        pages: Array.from(pages).flatMap((pageEl) => {
          const page = Number(pageEl.dataset.page);
          if (!Number.isFinite(page)) return [];
          const rect = pageEl.getBoundingClientRect();
          return [{ page, top: rect.top, bottom: rect.bottom }];
        }),
      });
      const programmaticPage = programmaticPageRef.current;
      if (programmaticPage !== null) {
        if (bestPage !== programmaticPage) return;
        programmaticPageRef.current = null;
      }
      setCurrentPage((prev) => (prev === bestPage ? prev : bestPage));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCurrentPage);
    };
    const finishProgrammaticScroll = () => {
      programmaticPageRef.current = null;
      schedule();
    };
    updateCurrentPage();
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('scrollend', finishProgrammaticScroll, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      root.removeEventListener('scroll', schedule);
      root.removeEventListener('scrollend', finishProgrammaticScroll);
      window.removeEventListener('resize', schedule);
    };
    // `containerRef` is stable; the listeners re-attach when the document,
    // its page count, or the rendered scale changes the geometry they read.
  }, [doc, numPages, scale, containerRef]);

  return {
    currentPage,
    setCurrentPage,
    beginProgrammaticScroll: (page, behavior) => {
      programmaticPageRef.current = behavior === 'smooth' ? page : null;
    },
    persistPage: (page) => {
      if (activeTab?.file?.format === 'pdf' && activeTab.pdfPage !== page) {
        updateTabPdfPage(activeTab.id, page);
      }
    },
    initialScrollDone,
  };
}
