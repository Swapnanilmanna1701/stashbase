import { useEffect, useState, type RefObject } from 'react';
import type { PdfPageMetrics } from '@/features/documents/hooks/usePdfDocument';

export const PDF_MIN_SCALE = 0.5;
export const PDF_MAX_SCALE = 3;

export interface PdfZoom {
  scale: number;
  autoFit: boolean;
  canZoomOut: boolean;
  canZoomIn: boolean;
  /** The scale that makes the page fill the pane — read by the viewer's
   *  initial-scroll gate, which must wait for auto-fit to settle. */
  fitScale: () => number;
  fit: () => void;
  actualSize: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
}

/**
 * Scale and the auto-fit mode: the zoom machine, with no knowledge of the
 * document, the current page, or scrolling. It watches the pane through a
 * ResizeObserver while auto-fit holds, and resets to 1× auto-fit whenever
 * `resetKey` (the versioned source URL) changes.
 */
export function usePdfZoom({
  containerRef,
  pageMetrics,
  resetKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  pageMetrics: PdfPageMetrics | null;
  resetKey: string;
}): PdfZoom {
  const [scale, setScale] = useState(1);
  const [autoFit, setAutoFit] = useState(true);

  /** Fit means fill: the page takes the pane's full width, edge to edge.
   *  A side gutter here would be a strip of canvas the user never asked
   *  for — the canvas already shows above and between pages, which is
   *  where it does the job of separating one sheet from the next.
   *  `clientWidth` excludes a classic vertical scrollbar, so the fitted
   *  page can never provoke a horizontal one. */
  function fitScale(): number {
    const viewportWidth = containerRef.current?.clientWidth ?? 0;
    const pageWidth = pageMetrics?.width ?? 0;
    if (viewportWidth <= 0 || pageWidth <= 0) return 1;
    return Math.max(PDF_MIN_SCALE, Math.min(PDF_MAX_SCALE, viewportWidth / pageWidth));
  }

  // A new source opens at 1× auto-fit, exactly as a first mount does.
  useEffect(() => {
    setScale(1);
    setAutoFit(true);
  }, [resetKey]);

  useEffect(() => {
    if (!autoFit || !pageMetrics) return;
    setScale(fitScale());
  }, [autoFit, pageMetrics]);

  useEffect(() => {
    if (!autoFit) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(fitScale()));
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit, pageMetrics]);

  return {
    scale,
    autoFit,
    canZoomOut: scale > PDF_MIN_SCALE + 0.001,
    canZoomIn: scale < PDF_MAX_SCALE - 0.001,
    fitScale,
    fit: () => {
      setAutoFit(true);
      setScale(fitScale());
    },
    actualSize: () => {
      setAutoFit(false);
      setScale(1);
    },
    zoomOut: () => {
      setAutoFit(false);
      setScale((s) => Math.max(PDF_MIN_SCALE, s - 0.2));
    },
    zoomIn: () => {
      setAutoFit(false);
      setScale((s) => Math.min(PDF_MAX_SCALE, s + 0.2));
    },
  };
}
