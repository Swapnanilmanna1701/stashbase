/**
 * The PDF viewer's internals, asserted through the hooks that now own them.
 *
 * These claims used to live in `common/__tests__/renderer-foundation.test.ts`
 * as six regexes over `PdfPreview.tsx` source text — the last source-text
 * component assertions in the renderer. They pinned effect dependency arrays
 * and the single-scroll-owner protocol, neither of which the 861-line
 * component exposed to a query. Splitting the viewer into `usePdfDocument`,
 * `usePdfZoom`, `usePdfPageTracking`, and `usePdfFindRegistration` gave each
 * one an interface to drive, so every claim below is now made by running the
 * behaviour rather than by reading the file that implements it.
 *
 * `PdfPreview` itself keeps the single scroll owner (`scrollToTarget`); the
 * protocol it announces — smooth jumps claim their destination, instant ones
 * claim nothing — is enforced by `usePdfPageTracking` and asserted here.
 */
import '@/common/__tests__/domEnvironment';
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement as h, useRef, type ReactElement } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { testWindow } from '@/common/__tests__/domEnvironment';
import { appState, mountApp, withDom, type DomHarness } from '@/common/__tests__/renderHarness';
import { PdfPreview } from '@/features/documents/components/PdfPreview';
import {
  usePdfDocument,
  type PdfLoader,
  type PdfLoadingTask,
} from '@/features/documents/hooks/usePdfDocument';
import { usePdfFindRegistration } from '@/features/documents/hooks/usePdfFindRegistration';
import {
  usePdfPageTracking,
  type PdfPageTracking,
} from '@/features/documents/hooks/usePdfPageTracking';
import { usePdfZoom, type PdfZoom } from '@/features/documents/hooks/usePdfZoom';
import type { FindController } from '@/store/contexts/AppContext';
import type { Tab } from '@/store/state/state';

// The scroll listeners coalesce through requestAnimationFrame. Queue the
// callbacks so a test can decide when a frame lands, instead of racing a
// timer: `window.requestAnimationFrame` is what the tracking hook calls.
const pendingFrames: FrameRequestCallback[] = [];
let frameId = 0;
testWindow.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  pendingFrames.push(cb);
  return ++frameId;
}) as unknown as typeof testWindow.requestAnimationFrame;
testWindow.cancelAnimationFrame = (() => undefined) as unknown as typeof testWindow.cancelAnimationFrame;

async function paintFrame(): Promise<void> {
  const due = pendingFrames.splice(0);
  await act(async () => { for (const cb of due) cb(0); });
}

function pdfTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 't1',
    file: { name: 'paper.pdf', format: 'pdf', content: '' },
    editMode: false,
    dirty: false,
    pendingAnchor: null,
    pendingHighlight: null,
    saveStatus: { text: '', cls: '' } as Tab['saveStatus'],
    pdfPage: 1,
    ...overrides,
  };
}

const fakeDoc = {} as PDFDocumentProxy;

/* ------------------------------------------------------------------ */
/* usePdfDocument — the load lifecycle is keyed by the source URL alone */
/* ------------------------------------------------------------------ */

interface Deferred {
  task: PdfLoadingTask;
  settle: (doc: PDFDocumentProxy) => void;
  fail: (err: Error) => void;
  destroys: () => number;
}

function deferredTask(): Deferred {
  let settle!: (doc: PDFDocumentProxy) => void;
  let fail!: (err: Error) => void;
  let destroys = 0;
  const promise = new Promise<PDFDocumentProxy>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    task: { promise, destroy: async () => { destroys += 1; } },
    settle,
    fail,
    destroys: () => destroys,
  };
}

/** A pdf.js document stub: only the members the load lifecycle touches. */
function docStub(numPages: number, size = { width: 612, height: 792 }): PDFDocumentProxy {
  return {
    numPages,
    getPage: async () => ({ getViewport: () => size }),
    destroy: async () => undefined,
  } as unknown as PDFDocumentProxy;
}

function DocumentProbe({ url, load }: { url: string; load: PdfLoader; churn: object }): ReactElement {
  const { doc, numPages, pageMetrics, error } = usePdfDocument(url, load);
  return h('div', {
    'data-doc': doc ? 'open' : 'none',
    'data-pages': String(numPages),
    'data-metrics': pageMetrics ? `${pageMetrics.width}x${pageMetrics.height}` : '',
    'data-error': error ?? '',
  });
}

test('the pdf.js document is opened once per source URL, whatever else re-renders', async () => {
  await withDom(async (dom) => {
    const opened: string[] = [];
    const tasks: Deferred[] = [];
    const load: PdfLoader = (fileUrl) => {
      opened.push(fileUrl);
      const next = deferredTask();
      tasks.push(next);
      return next.task;
    };

    await dom.render(h(DocumentProbe, { url: '/asset/a.pdf?v=1', load, churn: {} }));
    assert.deepEqual(opened, ['/asset/a.pdf?v=1']);

    // Re-render with a brand-new object identity every time — the shape of
    // the original bug, where an action bag in the dependency array
    // destroyed and recreated the live document after unrelated polling.
    for (let i = 0; i < 4; i++) {
      await dom.render(h(DocumentProbe, { url: '/asset/a.pdf?v=1', load, churn: {} }));
    }
    assert.deepEqual(opened, ['/asset/a.pdf?v=1'], 'a re-render never reopens the document');
    assert.equal(tasks[0].destroys(), 0, 'the live loading task is never destroyed by a re-render');

    // A new source version IS a new document.
    await dom.render(h(DocumentProbe, { url: '/asset/a.pdf?v=2', load, churn: {} }));
    assert.deepEqual(opened, ['/asset/a.pdf?v=1', '/asset/a.pdf?v=2']);
    assert.equal(tasks[0].destroys(), 1, 'the superseded loading task is destroyed');
  });
});

test('a loaded document publishes its page count and sampled page-1 geometry', async () => {
  await withDom(async (dom) => {
    const deferred = deferredTask();
    await dom.render(h(DocumentProbe, { url: '/asset/a.pdf', load: () => deferred.task, churn: {} }));
    assert.equal(dom.query('[data-doc]')?.dataset.doc, 'none');

    deferred.settle(docStub(12));
    await dom.flush();

    const probe = dom.query('[data-doc]');
    assert.equal(probe?.dataset.doc, 'open');
    assert.equal(probe?.dataset.pages, '12');
    // Placeholder heights come from this sample; without it a scroll to a
    // chunk on an unrendered page mis-fires by hundreds of pixels.
    assert.equal(probe?.dataset.metrics, '612x792');
    assert.equal(probe?.dataset.error, '');
  });
});

test('a failed load surfaces its reason, and a superseded load never publishes', async () => {
  await withDom(async (dom) => {
    const first = deferredTask();
    const second = deferredTask();
    const tasks = [first, second];
    let call = 0;
    const load: PdfLoader = () => tasks[call++].task;

    await dom.render(h(DocumentProbe, { url: '/asset/a.pdf?v=1', load, churn: {} }));
    await dom.render(h(DocumentProbe, { url: '/asset/a.pdf?v=2', load, churn: {} }));

    // The first request answers late, after its source was replaced.
    first.settle(docStub(99));
    await dom.flush();
    assert.equal(dom.query('[data-doc]')?.dataset.pages, '0', 'late work from an older source is dropped');

    second.fail(new Error('missing PDF body'));
    await dom.flush();
    assert.equal(dom.query('[data-error]')?.dataset.error, 'missing PDF body');
  });
});

/* ------------------------------------------------------------------ */
/* usePdfPageTracking — the single-scroll-owner protocol                */
/* ------------------------------------------------------------------ */

const PAGE_HEIGHT = 100;
const VIEWPORT_HEIGHT = 300;
const PAGE_COUNT = 10;

interface TrackingProbeProps {
  resetKey: string;
  activeTab: Tab | null;
  updateTabPdfPage: (tabId: string, page: number) => void;
}

const tracking: { api: PdfPageTracking | null } = { api: null };

function TrackingProbe({ resetKey, activeTab, updateTabPdfPage }: TrackingProbeProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  tracking.api = usePdfPageTracking({
    containerRef,
    doc: fakeDoc,
    numPages: PAGE_COUNT,
    scale: 1,
    resetKey,
    activeTab,
    updateTabPdfPage,
  });
  return h(
    'div',
    { ref: containerRef, 'data-viewer': String(tracking.api.currentPage) },
    Array.from({ length: PAGE_COUNT }, (_, i) => h('div', { key: i, 'data-page': String(i + 1) })),
  );
}

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

/** Give the mounted probe a scroll geometry the hook can read: happy-dom
 *  reports zeros for every box, and the hook's whole job is reading boxes. */
function installViewport(root: HTMLElement): (top: number) => void {
  let scrollTop = 0;
  Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => VIEWPORT_HEIGHT });
  Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => PAGE_COUNT * PAGE_HEIGHT });
  Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => scrollTop });
  root.getBoundingClientRect = () => rect(0, VIEWPORT_HEIGHT);
  for (const [i, el] of [...root.querySelectorAll<HTMLElement>('[data-page]')].entries()) {
    el.getBoundingClientRect = () => rect(i * PAGE_HEIGHT - scrollTop, PAGE_HEIGHT);
  }
  return (top: number) => { scrollTop = top; };
}

/** The page whose top the reading marker sits in at each scroll offset:
 *  marker = 0.35 * 300 = 105px down the pane. */
const SCROLL_SHOWING_PAGE_2 = 0;
const SCROLL_SHOWING_PAGE_4 = 200;
const SCROLL_SHOWING_PAGE_6 = 400;

async function mountTracking(
  dom: DomHarness,
  props: TrackingProbeProps,
): Promise<{ root: HTMLElement; scrollTo: (top: number) => void; page: () => string | undefined }> {
  await dom.render(h(TrackingProbe, props));
  const root = dom.query('[data-viewer]')!;
  const setScrollTop = installViewport(root);
  return {
    root,
    scrollTo: (top) => setScrollTop(top),
    page: () => dom.query('[data-viewer]')?.dataset.viewer,
  };
}

async function scroll(dom: DomHarness, root: HTMLElement, event = 'scroll'): Promise<void> {
  await dom.fire(root, new Event(event));
  await paintFrame();
}

test('viewport tracking stays silent until the saved-page restore has run', async () => {
  await withDom(async (dom) => {
    const writes: Array<[string, number]> = [];
    const view = await mountTracking(dom, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ pdfPage: 4 }),
      updateTabPdfPage: (id, page) => writes.push([id, page]),
    });

    assert.equal(view.page(), '4', 'the viewer opens on the page the tab remembers');
    view.scrollTo(SCROLL_SHOWING_PAGE_2);
    await scroll(dom, view.root);
    assert.equal(view.page(), '4', 'geometry before the restore jump cannot overwrite the saved page');
    assert.deepEqual(writes, []);

    tracking.api!.initialScrollDone.current = true;
    await scroll(dom, view.root);
    assert.equal(view.page(), '2', 'once the restore has run, the viewport owns the page');
    assert.deepEqual(writes, [['t1', 2]], 'the page the reader is on reaches tab state');
  });
});

test('a smooth jump owns its page until the viewport reaches it', async () => {
  await withDom(async (dom) => {
    const writes: Array<[string, number]> = [];
    const view = await mountTracking(dom, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ pdfPage: 1 }),
      updateTabPdfPage: (id, page) => writes.push([id, page]),
    });
    tracking.api!.initialScrollDone.current = true;

    // What the viewer's single scroll owner does for a smooth jump.
    await act(async () => {
      tracking.api!.beginProgrammaticScroll(6, 'smooth');
      tracking.api!.setCurrentPage(6);
    });
    writes.length = 0;

    // The animation crosses page 4 on its way to 6.
    view.scrollTo(SCROLL_SHOWING_PAGE_4);
    await scroll(dom, view.root);
    assert.equal(view.page(), '6', 'an intermediate frame cannot overwrite the requested page');
    assert.deepEqual(writes, [], 'and cannot write the page it merely passed through');

    // Arrival releases the claim.
    view.scrollTo(SCROLL_SHOWING_PAGE_6);
    await scroll(dom, view.root);
    assert.equal(view.page(), '6');

    view.scrollTo(SCROLL_SHOWING_PAGE_2);
    await scroll(dom, view.root);
    assert.equal(view.page(), '2', 'after arrival the viewport owns the page again');
    assert.deepEqual(writes, [['t1', 2]]);
  });
});

test('an instant jump claims nothing, so the next reading publishes at once', async () => {
  await withDom(async (dom) => {
    const view = await mountTracking(dom, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ pdfPage: 1 }),
      updateTabPdfPage: () => undefined,
    });
    tracking.api!.initialScrollDone.current = true;

    await act(async () => {
      tracking.api!.beginProgrammaticScroll(6, 'auto');
      tracking.api!.setCurrentPage(6);
    });

    view.scrollTo(SCROLL_SHOWING_PAGE_4);
    await scroll(dom, view.root);
    assert.equal(view.page(), '4', 'an instant jump has no in-between frames to protect');
  });
});

test('scrollend releases a claim the viewport never completed', async () => {
  await withDom(async (dom) => {
    const view = await mountTracking(dom, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ pdfPage: 1 }),
      updateTabPdfPage: () => undefined,
    });
    tracking.api!.initialScrollDone.current = true;

    await act(async () => {
      tracking.api!.beginProgrammaticScroll(6, 'smooth');
      tracking.api!.setCurrentPage(6);
    });
    view.scrollTo(SCROLL_SHOWING_PAGE_4);
    await scroll(dom, view.root);
    assert.equal(view.page(), '6', 'still claimed while the scroll is in flight');

    await scroll(dom, view.root, 'scrollend');
    assert.equal(view.page(), '4', 'a jump the user interrupted does not strand the claim');
  });
});

test('direct navigation reaches tab state synchronously, and only for its own PDF tab', async () => {
  await withDom(async (dom) => {
    const writes: Array<[string, number]> = [];
    await mountTracking(dom, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ pdfPage: 1 }),
      updateTabPdfPage: (id, page) => writes.push([id, page]),
    });

    // No flush: waiting for the passive effect lets an immediate tab switch
    // unmount the viewer before the requested page is saved.
    tracking.api!.persistPage(7);
    assert.deepEqual(writes, [['t1', 7]]);

    tracking.api!.persistPage(1);
    assert.deepEqual(writes, [['t1', 7]], 'a page equal to the saved one writes nothing');

    await dom.render(h(TrackingProbe, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ file: { name: 'notes.md', format: 'md', content: '' } }),
      updateTabPdfPage: (id, page) => writes.push([id, page]),
    }));
    tracking.api!.persistPage(3);
    assert.deepEqual(writes, [['t1', 7]], 'a non-PDF tab never receives a page');
  });
});

test('a new source restores that tab\'s saved page and re-arms the restore jump', async () => {
  await withDom(async (dom) => {
    const view = await mountTracking(dom, {
      resetKey: '/asset/a.pdf?v=1',
      activeTab: pdfTab({ pdfPage: 1 }),
      updateTabPdfPage: () => undefined,
    });
    tracking.api!.initialScrollDone.current = true;
    view.scrollTo(SCROLL_SHOWING_PAGE_6);
    await scroll(dom, view.root);
    assert.equal(view.page(), '6');

    await dom.render(h(TrackingProbe, {
      resetKey: '/asset/a.pdf?v=2',
      activeTab: pdfTab({ pdfPage: 9 }),
      updateTabPdfPage: () => undefined,
    }));
    assert.equal(view.page(), '9', 'the reopened source starts where the tab left off');
    assert.equal(tracking.api!.initialScrollDone.current, false, 'and owes that page one restore jump');
  });
});

/* ------------------------------------------------------------------ */
/* usePdfFindRegistration — one registration per document               */
/* ------------------------------------------------------------------ */

function FindProbe({
  doc,
  registerFindController,
  churn,
}: {
  doc: PDFDocumentProxy | null;
  registerFindController: (controller: FindController | null) => void;
  churn: object;
}): ReactElement {
  usePdfFindRegistration({
    doc,
    numPages: 3,
    registerFindController,
    // Inline closures, exactly as the viewer passes them: they capture the
    // scroll owner and highlight state and change identity every render.
    onActiveMatch: () => { void churn; },
    onClose: () => { void churn; },
  });
  return h('div', { 'data-find': doc ? 'doc' : 'empty' });
}

test('Find registers once per document and is torn down with it', async () => {
  await withDom(async (dom) => {
    const registrations: Array<'controller' | 'null'> = [];
    const register = (controller: FindController | null) => {
      registrations.push(controller ? 'controller' : 'null');
    };

    await dom.render(h(FindProbe, { doc: null, registerFindController: register, churn: {} }));
    assert.deepEqual(registrations, [], 'no document, no Find controller');

    const doc = docStub(3);
    await dom.render(h(FindProbe, { doc, registerFindController: register, churn: {} }));
    assert.deepEqual(registrations, ['controller']);

    // Re-rendering churns both callbacks. Registering them as dependencies
    // would tear the controller down and rebuild it on every render,
    // dropping the user's in-flight search.
    for (let i = 0; i < 4; i++) {
      await dom.render(h(FindProbe, { doc, registerFindController: register, churn: {} }));
    }
    assert.deepEqual(registrations, ['controller'], 'a re-render never re-registers');

    await dom.render(h(FindProbe, { doc: null, registerFindController: register, churn: {} }));
    assert.deepEqual(registrations, ['controller', 'null'], 'closing the document unregisters');
  });
});

/* ------------------------------------------------------------------ */
/* PdfPreview — preparation arrives as props, never as an API call      */
/* ------------------------------------------------------------------ */

test('the viewer draws the preparation status it is handed and starts no reprocess of its own', async () => {
  await withDom(async (dom) => {
    // MainPane owns the band the PDF controls portal into.
    const slot = document.createElement('div');
    slot.id = 'pdf-chrome-slot';
    document.body.appendChild(slot);
    let retries = 0;
    const state = appState({ workspace: { tabs: [pdfTab()], activeTabId: 't1' } });

    try {
      await mountApp(dom, h(PdfPreview, {
        name: 'paper.pdf',
        status: { kind: 'error', text: 'This PDF is not searchable. Reprocess it to try again.' },
        onRetry: () => { retries += 1; },
      }), { state });

      const live = dom.byRole('status')[0];
      assert.match(live.textContent ?? '', /not searchable/, 'the failure reaches the live region');
      const reprocess = [...slot.querySelectorAll('button')].find((b) => b.textContent === 'Reprocess');
      assert.ok(reprocess, 'a standing failure offers the recovery command');
      await dom.fire(reprocess, new MouseEvent('click', { bubbles: true }));
      assert.equal(retries, 1, 'the command the owner supplied is what runs');

      // Working status carries no recovery command, and none is invented.
      await mountApp(dom, h(PdfPreview, {
        name: 'paper.pdf',
        status: { kind: 'working', text: 'Indexing searchable text…' },
      }), { state });
      assert.match(dom.byRole('status')[0].textContent ?? '', /Indexing searchable text/);
      assert.equal(
        [...slot.querySelectorAll('button')].some((b) => b.textContent === 'Reprocess'),
        false,
      );
    } finally {
      slot.remove();
    }
  });
});

/* ------------------------------------------------------------------ */
/* usePdfZoom                                                           */
/* ------------------------------------------------------------------ */

const zoom: { api: PdfZoom | null } = { api: null };

function ZoomProbe({ resetKey, pageWidth }: { resetKey: string; pageWidth: number }): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  zoom.api = usePdfZoom({
    containerRef,
    pageMetrics: { width: pageWidth, height: pageWidth * 1.3 },
    resetKey,
  });
  return h('div', {
    ref: containerRef,
    'data-zoom': String(Math.round(zoom.api.scale * 100)),
    'data-fit': String(zoom.api.autoFit),
  });
}

test('fit fills the pane width, explicit zoom leaves fit, and both stay in bounds', async () => {
  await withDom(async (dom) => {
    await dom.render(h(ZoomProbe, { resetKey: '/asset/a.pdf?v=1', pageWidth: 600 }));
    const root = dom.query('[data-zoom]')!;
    Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => 900 });

    // Auto-fit is the opening mode; the pane is 1.5 pages wide.
    await dom.render(h(ZoomProbe, { resetKey: '/asset/a.pdf?v=1', pageWidth: 601 }));
    assert.equal(dom.query('[data-fit]')?.dataset.fit, 'true');
    assert.equal(dom.query('[data-zoom]')?.dataset.zoom, '150');

    await act(async () => { zoom.api!.zoomIn(); });
    assert.equal(dom.query('[data-fit]')?.dataset.fit, 'false', 'an explicit zoom leaves fit mode');

    // The zoom ceiling holds however many times it is pushed.
    for (let i = 0; i < 20; i++) await act(async () => { zoom.api!.zoomIn(); });
    assert.equal(dom.query('[data-zoom]')?.dataset.zoom, '300');
    for (let i = 0; i < 40; i++) await act(async () => { zoom.api!.zoomOut(); });
    assert.equal(dom.query('[data-zoom]')?.dataset.zoom, '50');

    await act(async () => { zoom.api!.actualSize(); });
    assert.equal(dom.query('[data-zoom]')?.dataset.zoom, '100');

    // A new source opens fitted again.
    await dom.render(h(ZoomProbe, { resetKey: '/asset/a.pdf?v=2', pageWidth: 601 }));
    assert.equal(dom.query('[data-fit]')?.dataset.fit, 'true');
    assert.equal(dom.query('[data-zoom]')?.dataset.zoom, '150');
  });
});
