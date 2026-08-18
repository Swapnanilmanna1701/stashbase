import { useEffect, useState } from 'react';
import { PDFWorker, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
// Load the worker via Vite's `?worker` so we can wrap it with the
// Map-upsert polyfill pdfjs 5.7 needs but Electron's V8 lacks (see
// `lib/pdfWorker.ts` / `lib/pdfPolyfill.ts`). `?worker` bundles the
// worker for both dev and the packaged build, unlike a bare `?url`.
import PdfWorker from '@/features/documents/lib/pdfWorker?worker';
// Polyfill the main-thread scope too — render() calls getOrInsertComputed
// synchronously before it ever talks to the worker.
import '@/features/documents/lib/pdfPolyfill';

// One shared worker for the viewer, owned by US (a PDFWorker we construct)
// rather than handed to pdfjs via `GlobalWorkerOptions.workerPort`. The
// distinction is load-bearing: a `workerPort` worker is owned by whichever
// loadingTask is created over it, so `loadingTask.destroy()` — fired by the
// load effect's cleanup on tab close AND on React StrictMode's dev
// mount→unmount→mount — terminates the shared worker thread. The next
// getDocument then hits "PDFWorker.create - the worker is being destroyed".
// A worker passed explicitly to getDocument is NOT owned by the task, so
// destroy() tears down only the document and the thread survives every reopen.
// (PDFWorker.create over `new PDFWorker({ port })` only because the latter's
// generated d.ts mistypes `port` as null; both wrap the same port instance.)
const pdfWorker = PDFWorker.create({ port: new PdfWorker() });
const PDFJS_ASSET_BASE = '/pdfjs-assets';

/** Page-1 viewport at 1× scale — the viewer's placeholder geometry. */
export interface PdfPageMetrics {
  width: number;
  height: number;
}

/** The two members of a pdf.js loading task this hook drives. Named as an
 *  interface so the load lifecycle can be exercised without a worker
 *  thread — the same dependency seam `makePdfFindController` takes. */
export interface PdfLoadingTask {
  promise: Promise<PDFDocumentProxy>;
  destroy: () => Promise<unknown>;
}

export type PdfLoader = (fileUrl: string) => PdfLoadingTask;

/** Open one PDF over the shared worker. Every pdf.js option the viewer
 *  needs lives here and nowhere else. */
export function openPdfDocument(fileUrl: string): PdfLoadingTask {
  return getDocument({
    url: fileUrl,
    worker: pdfWorker,
    cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
    wasmUrl: `${PDFJS_ASSET_BASE}/wasm/`,
    useWorkerFetch: true,
    // Some creator-generated PDFs embed subset TrueType fonts whose
    // browser FontFace rendering maps glyphs incorrectly in Chromium.
    // Let pdf.js draw glyph outlines itself instead.
    disableFontFace: true,
  });
}

export interface PdfDocument {
  doc: PDFDocumentProxy | null;
  numPages: number;
  /**
   * Sampled page 1 viewport at 1× scale. Used as the per-page
   * placeholder height so the lazy-rendered pages reserve the
   * correct layout slot up front — without this, scrolling to a
   * chunk would mis-fire by hundreds of pixels whenever the target
   * page hadn't rendered yet (placeholder 800px vs. real ~1100px
   * shifts everything below). All pages in a typical paper share
   * the same page size, so a single sample is enough.
   */
  pageMetrics: PdfPageMetrics | null;
  error: string | null;
}

/**
 * The pdf.js document load lifecycle, and nothing else.
 *
 * The binary loader is keyed only by the versioned source URL. App-level
 * command objects can change after unrelated polling or shell updates; they
 * must never destroy and recreate the live pdf.js document — which is why
 * this hook takes a URL rather than the viewer's props or the store. The
 * second parameter is a module-constant opener, not a per-render value:
 * passing a fresh closure would reopen the document on every render.
 */
export function usePdfDocument(fileUrl: string, load: PdfLoader = openPdfDocument): PdfDocument {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageMetrics, setPageMetrics] = useState<PdfPageMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDoc(null);
    setNumPages(0);
    setPageMetrics(null);
    const loadingTask: PdfLoadingTask | null = load(fileUrl);
    loadingTask.promise.then(
      (pdf) => {
        if (cancelled) { void pdf.destroy(); return; }
        setDoc(pdf);
        setNumPages(pdf.numPages);
        // Sample page 1 size for placeholder heights — see pageMetrics.
        void pdf.getPage(1).then((p) => {
          if (cancelled) return;
          const vp = p.getViewport({ scale: 1 });
          setPageMetrics({ width: vp.width, height: vp.height });
        }).catch(() => { /* keep falling back to the 800px default */ });
      },
      (err: Error) => {
        if (cancelled) return;
        setError(err?.message || 'failed to open PDF');
      },
    );
    return () => {
      cancelled = true;
      loadingTask.destroy().catch(() => { /* ignore */ });
    };
  }, [fileUrl, load]);

  return { doc, numPages, pageMetrics, error };
}
