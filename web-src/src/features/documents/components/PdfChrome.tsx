import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';
import type { PdfPreparationStatus } from '@/features/documents/hooks/usePdfPreparation';

/** Every control in the PDF chrome row. Normal weight because a toolbar
 *  of numbers reads as data, not as labels, and quiet until pointed at:
 *  these sit bare on the chrome band, so a resting background on each one
 *  would put a row of boxes where the band's whole job is to disappear. */
const PDF_TOOL_ITEM = 'font-normal text-muted-foreground hover:text-foreground';

/** Render the PDF chrome (zoom controls + page count) into the
 *  `#pdf-chrome-slot` MainPane mounts at the top of the main pane —
 *  replaces the old "second toolbar row" so the viewer doesn't waste
 *  vertical folder on what's effectively chrome. Renders nothing if
 *  MainPane hasn't mounted the slot yet (initial render race).
 *
 *  Pure props: every value it shows is handed to it, so it holds no
 *  viewer state beyond the portal target and the page-jump field. */
export function PdfChromePortal({
  scale,
  autoFit,
  canZoomOut,
  canZoomIn,
  currentPage,
  numPages,
  status,
  retryPending,
  onRetry,
  onFit,
  onActualSize,
  onZoomOut,
  onZoomIn,
  onJumpToPage,
}: {
  scale: number;
  autoFit: boolean;
  canZoomOut: boolean;
  canZoomIn: boolean;
  currentPage: number;
  numPages: number;
  status: PdfPreparationStatus | null;
  retryPending: boolean;
  onRetry?: () => void;
  onFit: () => void;
  onActualSize: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onJumpToPage: (page: number) => void;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  // Resolve the portal target once on mount — MainPane renders the
  // `#pdf-chrome-slot` div alongside this viewer, so it's present by the
  // time this effect runs. (No deps: a per-render getElementById is
  // wasteful and the slot doesn't move.)
  useEffect(() => {
    setSlot(document.getElementById('pdf-chrome-slot'));
  }, []);
  useEffect(() => {
    if (!editingPage) setPageInput(String(currentPage));
  }, [currentPage, editingPage]);

  function submitPageJump() {
    const page = Number(pageInput.trim());
    if (!Number.isFinite(page)) {
      setPageInput(String(currentPage));
      setEditingPage(false);
      return;
    }
    onJumpToPage(page);
    setEditingPage(false);
  }

  const chrome = (
    <div className="pointer-events-auto flex w-full items-center gap-3 text-sm">
      {/* Mounted even when idle: a live region has to exist before the
        * message lands, or the status arrives silently. Empty is empty —
        * no transparent placeholder text holding the row open. */}
      <div
        className={
          'flex min-w-0 flex-1 items-center gap-1.5 leading-tight' +
          (status?.kind === 'error' ? ' text-destructive' : ' text-muted-foreground')
        }
        role="status"
      >
        {status?.kind === 'working' && (
          <span className="image-preparation-dot size-1.75 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        )}
        <span className="truncate">{status?.text ?? ''}</span>
        {status?.kind === 'error' && onRetry && (
          <button
            type="button"
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 [font:inherit] text-inherit underline underline-offset-2 disabled:cursor-progress disabled:opacity-60"
            disabled={retryPending}
            onClick={() => { void onRetry(); }}
          >
            {retryPending ? 'Reprocessing…' : 'Reprocess'}
          </button>
        )}
      </div>
      {/* No container: the row sits on the viewer's own canvas, and the
        * only control carrying a surface is the one that is switched on.
        * Grouping comes from spacing and a single hairline — a box here
        * would be a grey panel on a grey field. */}
      <div className="flex flex-none items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          className={PDF_TOOL_ITEM + ' text-lg'}
          title="Zoom out"
          aria-label="Zoom out"
          disabled={!canZoomOut}
          onClick={onZoomOut}
        >
          −
        </Button>
        {/* The percentage is the control, not a readout: clicking it is
          * how you get back to actual size. */}
        <Button
          variant="ghost"
          size="xs"
          className={PDF_TOOL_ITEM + ' min-w-10 px-1 tabular-nums'}
          title="Actual size (100%)"
          aria-label="Actual size"
          onClick={onActualSize}
        >
          {Math.round(scale * 100)}%
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={PDF_TOOL_ITEM + ' text-lg'}
          title="Zoom in"
          aria-label="Zoom in"
          disabled={!canZoomIn}
          onClick={onZoomIn}
        >
          +
        </Button>
        {/* Fit is a mode, so it stays pressed while it holds — otherwise
          * nothing on screen explains why the zoom reads 117%. Pressed is
          * the neutral selected surface, one step past hover: this toggle
          * is on by default, and a standing accent chip on every PDF is
          * exactly the repeated colour moment the palette rations. */}
        <Button
          variant="ghost"
          size="xs"
          className={
            PDF_TOOL_ITEM
            + ' ml-0.5 px-2'
            + ' aria-pressed:bg-active aria-pressed:text-foreground aria-pressed:hover:bg-active'
          }
          title="Fit to width"
          aria-pressed={autoFit}
          onClick={onFit}
        >
          Fit
        </Button>
        {numPages > 0 && (
          <>
            <span className="mx-1.5 h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
            {editingPage ? (
              /* h-6 matches the buttons it replaces so the row keeps its
                 height while the page field is open. */
              <span className="flex h-6 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <Input
                  autoFocus
                  className="h-5 w-8 px-0 text-center text-xs"
                  value={pageInput}
                  inputMode="numeric"
                  aria-label="PDF page number"
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={submitPageJump}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPageJump();
                    if (e.key === 'Escape') {
                      setPageInput(String(currentPage));
                      setEditingPage(false);
                    }
                  }}
                />
                <span>/ {numPages}</span>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                className={PDF_TOOL_ITEM + ' px-2 tabular-nums'}
                title="Jump to page"
                aria-label={`Page ${currentPage} of ${numPages} — jump to page`}
                onClick={() => {
                  setPageInput(String(currentPage));
                  setEditingPage(true);
                }}
              >
                {currentPage} / {numPages}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
  return slot ? createPortal(chrome, slot) : null;
}
