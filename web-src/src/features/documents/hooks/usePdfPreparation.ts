import { useEffect, useState } from 'react';
import { useFileReprocess } from '@/features/documents/hooks/useFileReprocess';
import { preparationWaitCopy } from '@/features/documents/lib/preparationCopy';
import { useWorkspace } from '@/store/contexts/AppContext';
import { getFileReadiness } from '@/store/lib/fileReadiness';

/** One line of preparation status for the PDF chrome row. `error` is the
 *  "not searchable" banner that carries the Reprocess affordance. */
export interface PdfPreparationStatus {
  kind: 'error' | 'working';
  text: string;
}

export interface PdfPreparation {
  status: PdfPreparationStatus | null;
  /** Present only while a failure is standing — starting a reprocess is a
   *  mutating call, so the affordance appears only when it is the answer. */
  onRetry?: () => void;
  /** A reprocess is under way: the control stays visible but inert. */
  retryPending: boolean;
}

/**
 * Preparation (searchable-text extraction) status for one PDF, plus the
 * reprocess command that answers a failure.
 *
 * The failure is sourced from `state.preparationFailures` — the same list
 * that drives the file tree's badges — so a user reprocesses a failed PDF
 * in context, in the chrome row above the document they just opened,
 * rather than hunting for it in a separate failure list.
 *
 * This is deliberately NOT part of the viewer. Indexing progress and
 * `api.reprocessFile` are preparation concerns; a viewer that owned them
 * would be a second mutation owner, and would have to read the whole
 * workspace slice to draw a document. The Documents dispatch calls this and
 * hands the viewer the two resulting props, so `PdfPreview` stays a viewer.
 *
 * `name` is null for every non-PDF format — the hook is called
 * unconditionally and returns an empty status in that case.
 */
export function usePdfPreparation(name: string | null): PdfPreparation {
  const state = useWorkspace();
  const { activeTab } = state;
  const [retryStarted, setRetryStarted] = useState(false);
  const failure = name ? getFileReadiness(state, name).preparationFailure : undefined;
  const conversionProgress = name ? state.conversionProgress[name] : undefined;
  // Same source identity the viewer keys its binary on: a version bump after
  // a successful reprocess is a new file, and retries start from scratch.
  const sourceVersion = name && activeTab?.file?.name === name ? activeTab.file.version ?? '' : '';
  const sourceFolder = name && activeTab?.file?.name === name ? activeTab.file.folder : undefined;
  const { retryBusy, retryError, retry } = useFileReprocess(name, { folder: sourceFolder, version: sourceVersion });

  useEffect(() => {
    setRetryStarted(false);
  }, [name, sourceVersion, sourceFolder]);

  useEffect(() => {
    if (!failure || (name !== null && state.pendingConversions.includes(name))) setRetryStarted(false);
  }, [failure, name, state.pendingConversions]);

  function chromeStatus(): PdfPreparationStatus | null {
    if (failure) {
      return {
        kind: 'error',
        text: retryError
          ? 'This PDF is not searchable. Reprocess could not start. Try again.'
          : 'This PDF is not searchable. Reprocess it to try again.',
      };
    }
    if (!conversionProgress) return null;
    if (conversionProgress.phase === 'queued' || conversionProgress.phase === 'yielded') {
      return { kind: 'working', text: preparationWaitCopy('searchable-text', conversionProgress.tasksAhead) };
    }
    if (conversionProgress.phase === 'indexing') {
      return { kind: 'working', text: 'Indexing searchable text…' };
    }
    if (conversionProgress.currentPage) {
      return { kind: 'working', text: `Reading page ${conversionProgress.currentPage}…` };
    }
    return { kind: 'working', text: 'Preparing searchable text…' };
  }

  async function onRetry() {
    setRetryStarted(await retry());
  }

  return {
    status: name ? chromeStatus() : null,
    onRetry: failure && name ? onRetry : undefined,
    retryPending: retryBusy || retryStarted,
  };
}
