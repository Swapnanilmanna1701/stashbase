import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PdfPageHighlight } from '@/features/documents/lib/pdfText';

/** Render a single PDF page into a canvas with text layer on top so
 *  selection + find work. Mounted lazily via IntersectionObserver so
 *  the long-tail of pages in a 200-page paper doesn't eat memory.
 *
 *  Pure props: the page owns only its own visibility and rendered size,
 *  never the viewer's document, zoom, or scroll state. */
export function PdfPage({
  doc,
  pageIndex,
  scale,
  placeholderHeight,
  highlight,
}: {
  doc: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  placeholderHeight: number;
  highlight: PdfPageHighlight | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(pageIndex < 2); // eager-render first 2 pages
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setVisible(true); io.disconnect(); break; }
      }
    }, { rootMargin: '500px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let pageProxy: PDFPageProxy | null = null;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;
    void doc.getPage(pageIndex + 1).then((page) => {
      if (cancelled) {
        page.cleanup();
        return;
      }
      pageProxy = page;
      // Canonical pdfjs HiDPI pattern: size the backing store by the
      // device pixel ratio, keep the CSS box at logical size, and let a
      // `transform` matrix scale the drawing up.
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const logicalWidth = Math.floor(viewport.width);
      const logicalHeight = Math.floor(viewport.height);
      const backingWidth = Math.floor(viewport.width * ratio);
      const backingHeight = Math.floor(viewport.height * ratio);
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = backingWidth;
      renderCanvas.height = backingHeight;
      renderTask = page.render({
        canvas: renderCanvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      renderTask.promise.then(() => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        // Resizing a visible canvas clears it immediately. Render the new
        // zoom level offscreen first, then swap the finished bitmap in one
        // frame so zooming does not flash white between old/new paints.
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        canvas.style.width = `${logicalWidth}px`;
        canvas.style.height = `${logicalHeight}px`;
        ctx.drawImage(renderCanvas, 0, 0);
        setRenderedSize({ width: logicalWidth, height: logicalHeight });
      }).catch((err: unknown) => {
        // Cancels (tab switch / scroll-out) reject with
        // RenderingCancelledException — expected, ignore. Surface the rest.
        if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
        console.error(`[pdf] page ${pageIndex + 1} render failed:`, err);
      });
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.error(`[pdf] page ${pageIndex + 1} load failed:`, err);
      }
    });
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
      if (pageProxy) pageProxy.cleanup();
    };
  }, [doc, pageIndex, scale, visible]);

  const reservedHeight = renderedSize?.height ?? placeholderHeight;
  const reservedWidth = renderedSize?.width;

  return (
    <div
      ref={rootRef}
      className="relative bg-white shadow-low"
      data-page={pageIndex + 1}
      style={{
        minHeight: reservedHeight,
        width: reservedWidth ? `${reservedWidth}px` : undefined,
      }}
    >
      {visible ? <canvas ref={canvasRef} className="block" /> : (
        <div className="flex min-h-[800px] w-[600px] items-center justify-center text-sm text-muted-foreground">Page {pageIndex + 1}</div>
      )}
      {/* No margin page number: at fit-to-width the gutter is 24px, so
        * the marker was always clipped by the pane edge, and the chrome
        * row already tracks the page you're on as you scroll. */}
      {visible && renderedSize && highlight && (
        <div className="pointer-events-none absolute inset-0 z-2" aria-hidden="true">
          {highlight.rects.map((rect, i) => (
            <div
              key={i}
              className="pdf-page-highlight"
              style={{
                left: `${rect.x * renderedSize.width}px`,
                top: `${rect.y * renderedSize.height}px`,
                width: `${rect.width * renderedSize.width}px`,
                height: `${rect.height * renderedSize.height}px`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
