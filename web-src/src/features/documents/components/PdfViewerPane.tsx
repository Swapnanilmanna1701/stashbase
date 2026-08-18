import { PdfPreview } from '@/features/documents/components/PdfPreview';
import { usePdfPreparation } from '@/features/documents/hooks/usePdfPreparation';

/**
 * The PDF branch's lazy entry: preparation policy composed onto the viewer.
 *
 * `PdfPreview` draws the failure banner and Reprocess control but must not
 * decide when they appear or perform the mutating call — that is preparation
 * policy, and a viewer performing it was the layering defect this split
 * removed. `usePdfPreparation` owns the decision.
 *
 * It is composed HERE rather than in `DocumentViewer` because the viewer
 * dispatch is eager: a hook called there ships in the initial chunk for every
 * window, including the ones that never open a PDF. Everything in this file is
 * PDF-only, so it belongs behind the same dynamic import as the viewer it
 * feeds. `DocumentViewer` lazy-loads this module, not `PdfPreview` — the
 * dynamic entry pinned in `scripts/check-renderer-chunks.mjs` names this file
 * for that reason.
 */
export default function PdfViewerPane({ name }: { name: string }) {
  const { status, onRetry, retryPending } = usePdfPreparation(name);
  return (
    <PdfPreview
      name={name}
      status={status}
      onRetry={onRetry}
      retryPending={retryPending}
    />
  );
}
