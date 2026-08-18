import { Suspense } from 'react';
import { LazyLoadBoundary, lazyWithRetry } from '@/common/components/ErrorBoundary';
import { HtmlPreview } from '@/features/documents/components/HtmlPreview';
import { ImagePreview } from '@/features/documents/components/ImagePreview';
import { retainedMarkdownTabs } from '@/features/documents/milkdown/retainedTabs';
import type { Tab } from '@/store/state/state';

/** Muted "Loading…" bodies shared by the lazy viewer fallbacks. */
const VIEWER_LOADING_CLASS = 'p-4 text-base text-muted-foreground';
const VIEWER_PADDED_LOADING_CLASS = 'p-6 text-base text-muted-foreground';
const VIEWER_CENTERED_LOADING_CLASS = 'grid h-full place-items-center text-base text-muted-foreground';

/* Every viewer heavy enough to have its own runtime (Milkdown, pdf.js,
 * mammoth, the JSON tree) loads at the moment a file of that format is
 * opened. The declarations live HERE rather than in the shell so adding a
 * format is a change inside this feature — the composition root only ever
 * renders `<DocumentViewer />`. Their manifest paths are pinned by
 * `scripts/check-renderer-chunks.mjs`. */
const LazyCrepeDocument = lazyWithRetry(() => import('@/features/documents/components/CrepeDocument').then((mod) => ({ default: mod.CrepeDocument })));
const LazyPdfViewerPane = lazyWithRetry(() => import('@/features/documents/components/PdfViewerPane'));
const LazyDocxPreview = lazyWithRetry(() => import('@/features/documents/components/DocxPreview').then((mod) => ({ default: mod.DocxPreview })));
const LazyAudioPreview = lazyWithRetry(() => import('@/features/documents/components/AudioPreview').then((mod) => ({ default: mod.AudioPreview })));
const LazyJsonDocument = lazyWithRetry(() => import('@/features/documents/components/JsonDocument').then((mod) => ({ default: mod.JsonDocument })));
const LazyConflictResolver = lazyWithRetry(() => import('@/features/documents/components/ConflictResolver').then((mod) => ({ default: mod.ConflictResolver })));

/**
 * The file-format → viewer dispatch, and the only Documents surface the
 * shell renders. It fills the host cell it is given; the surrounding
 * layout (tab strip, chrome band, PDF control slot, the floating edit
 * toggle) belongs to the shell, because those are shell chrome that
 * happens to key off the open file's format.
 *
 * Markdown is not part of the switch: retained Markdown editors render as
 * a stack of hidden layers so switching tabs does not tear down and
 * rebuild a Milkdown instance (`retainedMarkdownTabs` owns which ones
 * survive). Every other format renders the single active file.
 *
 * Adding a format means one `lazyWithRetry` and one branch in this file.
 *
 * A tab whose save hit a disk conflict routes to the resolver instead of
 * its editor, for the two editable formats. That substitution belongs here
 * rather than in the shell for the same reason the format switch does: the
 * shell supplies tab state and a cell, and never learns which surface a tab
 * is currently showing.
 *
 * Every branch here is a lazy boundary, and this file is eager — it is the
 * component `MainPane` renders. So nothing format-specific may be computed
 * at this level: a hook called here ships in the initial chunk for every
 * window, including the ones that never open that format. PDF preparation is
 * the worked example — extraction progress and the Reprocess command are
 * preparation concerns rather than viewer ones, but they are decided in
 * `PdfViewerPane` behind the PDF dynamic import, not here.
 */
export function DocumentViewer({
  tabs,
  activeTab,
  activeTabId,
  editorHistory,
}: {
  tabs: Tab[];
  activeTab: Tab | null;
  activeTabId: string | null;
  editorHistory: string[];
}) {
  const cur = activeTab?.file ?? null;
  const editMode = activeTab?.editMode ?? false;
  const resourceResetKey = cur ? `${cur.folder ?? ''}:${cur.name}:${cur.version ?? ''}` : undefined;
  const markdownTabs = retainedMarkdownTabs(tabs, editorHistory, activeTabId);

  return (
    <>
      {markdownTabs.map((tab) => {
        const file = tab.file!;
        const active = tab.id === activeTabId;
        return (
          <div
            key={`${tab.id}:${file.folder ?? ''}:${file.name}`}
            className="markdown-tab-layer"
            hidden={!active}
          >
            {tab.conflict ? (
              <Suspense fallback={<div className={VIEWER_LOADING_CLASS} role="status">Loading conflict view…</div>}>
                <LazyConflictResolver tabId={tab.id} />
              </Suspense>
            ) : (
              <LazyLoadBoundary
                className={VIEWER_LOADING_CLASS}
                label="Markdown document"
                resetKey={`${file.folder ?? ''}:${file.name}:${file.version ?? ''}`}
              >
                <Suspense fallback={<div className={VIEWER_LOADING_CLASS} role="status">Opening document…</div>}>
                  <LazyCrepeDocument
                    tabId={tab.id}
                    name={file.name}
                    content={file.content}
                    readOnly={!tab.editMode}
                    active={active}
                    dirty={tab.dirty}
                    folder={file.folder}
                  />
                </Suspense>
              </LazyLoadBoundary>
            )}
          </div>
        );
      })}
      {cur && cur.format === 'json' && (
        activeTab?.conflict ? (
          <Suspense fallback={<div className={VIEWER_LOADING_CLASS} role="status">Loading conflict view…</div>}>
            <LazyConflictResolver tabId={activeTab.id} />
          </Suspense>
        ) : (
          <LazyLoadBoundary className={VIEWER_LOADING_CLASS} label="JSON document" resetKey={resourceResetKey}>
            <Suspense fallback={<div className={VIEWER_LOADING_CLASS}>Opening JSON…</div>}>
              <LazyJsonDocument
                key={activeTab?.id ?? cur.name}
                tabId={activeTab?.id ?? ''}
                content={cur.content}
                readOnly={!editMode}
                active
              />
            </Suspense>
          </LazyLoadBoundary>
        )
      )}
      {cur && !editMode && cur.format === 'html' && (
        <HtmlPreview name={cur.name} />
      )}
      {cur && cur.format === 'docx' && (
        <LazyLoadBoundary className={VIEWER_CENTERED_LOADING_CLASS} label="document preview" resetKey={resourceResetKey}>
          <Suspense fallback={<div className={VIEWER_CENTERED_LOADING_CLASS}>Opening document…</div>}>
            <LazyDocxPreview name={cur.name} />
          </Suspense>
        </LazyLoadBoundary>
      )}
      {cur && cur.format === 'pdf' && (
        // PDFs have no edit mode — the source is a binary file. Only
        // the original PDF is shown: the extracted `.md` is a hidden
        // implementation detail (search hits remap back to the PDF;
        // the derived note must never surface as content). The
        // preparation failure banner + Reprocess are decided inside the
        // lazy chunk (PdfViewerPane) and handed to the viewer, which only
        // draws them — that policy is PDF-only and must not ship eagerly.
        <LazyLoadBoundary className={VIEWER_LOADING_CLASS} label="PDF preview" resetKey={resourceResetKey}>
          <Suspense fallback={<div className={VIEWER_LOADING_CLASS}>Loading PDF…</div>}>
            <LazyPdfViewerPane key={activeTab?.id} name={cur.name} />
          </Suspense>
        </LazyLoadBoundary>
      )}
      {cur && cur.format === 'image' && (
        // Images, like PDFs, are binary — no edit mode.
        <ImagePreview name={cur.name} />
      )}
      {cur && cur.format === 'audio' && (
        <LazyLoadBoundary className={VIEWER_PADDED_LOADING_CLASS} label="audio preview" resetKey={resourceResetKey}>
          <Suspense fallback={<div className={VIEWER_PADDED_LOADING_CLASS}>Opening audio…</div>}>
            <LazyAudioPreview name={cur.name} />
          </Suspense>
        </LazyLoadBoundary>
      )}
    </>
  );
}
