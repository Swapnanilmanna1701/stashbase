import { useEffect, useMemo, useState } from 'react';
import { setWasmSource, useXlsxViewerController, XlsxViewer } from '@extend-ai/react-xlsx';
import wasmUrl from '@extend-ai/react-xlsx/duke_sheets_wasm_bg.wasm?url';
import { versionedAssetUrl } from '@/common/api/api';
import { Button } from '@/common/components/ui/button';
import { useFileReprocess } from '@/features/documents/hooks/useFileReprocess';
import { preparationWaitCopy } from '@/features/documents/lib/preparationCopy';
import { useWorkspace } from '@/store/contexts/AppContext';
import { getPreparationFailure } from '@/store/lib/fileReadiness';

setWasmSource(wasmUrl);
const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 30_000;
const MAX_COPY_CELLS = 10_000;

export function XlsxPreview({ name }: { name: string }) {
  const state = useWorkspace();
  const { activeTab } = state;
  const source = activeTab?.file?.name === name ? activeTab.file : null;
  const [bytes, setBytes] = useState<ArrayBuffer>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { retryBusy, retryError, retry } = useFileReprocess(name, {
    folder: source?.folder,
    version: source?.version,
  });
  const failure = getPreparationFailure(state, name);
  const progress = state.conversionProgress[name];
  const preparationStatus = progress
    ? progress.phase === 'indexing'
      ? 'Indexing searchable workbook text…'
      : progress.phase === 'queued' || progress.phase === 'yielded'
        ? preparationWaitCopy('searchable-text', progress.tasksAhead)
        : 'Preparing searchable workbook text…'
    : null;

  useEffect(() => {
    const controller = new AbortController();
    setBytes(undefined);
    setLoadError(null);
    void fetch(versionedAssetUrl(name, source?.version ?? '', source?.folder), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response.json().catch(() => null) as { error?: unknown } | null;
          throw new Error(typeof detail?.error === 'string' ? detail.error : `Workbook could not be opened (HTTP ${response.status}).`);
        }
        const length = Number(response.headers.get('content-length') ?? 0);
        if (length > MAX_WORKBOOK_BYTES) throw new Error('Workbook exceeds the 25 MiB preview limit.');
        const result = await response.arrayBuffer();
        if (result.byteLength > MAX_WORKBOOK_BYTES) throw new Error('Workbook exceeds the 25 MiB preview limit.');
        if (!controller.signal.aborted) setBytes(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [name, source?.folder, source?.version]);

  const controller = useXlsxViewerController({
    file: bytes,
    fileName: name,
    maxFileSizeBytes: MAX_WORKBOOK_BYTES,
    readOnly: true,
    useWorker: true,
    showHiddenSheets: false,
  });
  useEffect(() => {
    if (!bytes || controller.sheets.length > 0 || controller.error) return;
    const timer = window.setTimeout(() => {
      setLoadError('Workbook preview exceeded the 30 second parsing limit.');
      setBytes(undefined);
    }, PREVIEW_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [bytes, controller.error, controller.sheets.length]);
  const error = loadError ?? controller.error?.message ?? null;
  const status = useMemo(() => controller.selectedRangeAddress ?? controller.activeCellAddress ?? 'No cell selected', [controller.selectedRangeAddress, controller.activeCellAddress]);
  const featureSummary = useMemo(() => {
    const features = [];
    if ((controller.activeSheet?.freezePanes?.row ?? 0) > 0 || (controller.activeSheet?.freezePanes?.col ?? 0) > 0) features.push('frozen panes');
    if (controller.activeSheet?.hasHorizontalMerges || controller.activeSheet?.hasVerticalMerges) features.push('merged cells');
    features.push(`${controller.images.length} ${controller.images.length === 1 ? 'image' : 'images'}`);
    features.push(`${controller.charts.length} ${controller.charts.length === 1 ? 'chart' : 'charts'}`);
    return `Workbook features: ${features.join('; ')}.`;
  }, [controller.activeSheet, controller.charts.length, controller.images.length]);
  const copySelection = async () => {
    setCopyStatus('idle');
    let text = controller.getClipboardData()?.text;
    const range = controller.selection ?? (controller.activeCell ? { start: controller.activeCell, end: controller.activeCell } : null);
    if (!text && range && controller.activeSheet && controller.getCellSnapshotAsync) {
      const startRow = Math.min(range.start.row, range.end.row);
      const endRow = Math.max(range.start.row, range.end.row);
      const startCol = Math.min(range.start.col, range.end.col);
      const endCol = Math.max(range.start.col, range.end.col);
      const cellCount = (endRow - startRow + 1) * (endCol - startCol + 1);
      if (cellCount <= MAX_COPY_CELLS) {
        const rows: string[] = [];
        for (let row = startRow; row <= endRow; row += 1) {
          const cells = await Promise.all(Array.from({ length: endCol - startCol + 1 }, (_, offset) => (
            controller.getCellSnapshotAsync!(controller.activeSheet!.workbookSheetIndex, row, startCol + offset)
              .then((snapshot) => snapshot.displayValue)
          )));
          rows.push(cells.join('\t'));
        }
        text = rows.join('\n');
      }
    }
    if (!text) {
      setCopyStatus('failed');
      return;
    }
    try {
      await navigator.clipboard?.writeText(text);
      if (navigator.clipboard) {
        setCopyStatus('copied');
        return;
      }
    } catch {
      // Fall through to Electron's synchronous copy path when the async
      // Clipboard API is unavailable or denied.
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    setCopyStatus(copied ? 'copied' : 'failed');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="xlsx-preview">
      <span className="sr-only" data-testid="xlsx-feature-summary">{featureSummary}</span>
      {failure ? (
        <div className="flex min-h-8 shrink-0 items-center gap-2 border-b border-border bg-background px-3 text-sm text-muted-foreground" role="status">
          <span className="min-w-0 flex-1">The workbook is visible, but its searchable text is unavailable.</span>
          {retryError ? <span className="truncate text-destructive">{retryError}</span> : null}
          <Button variant="outline" size="xs" disabled={retryBusy} onClick={() => { void retry(); }}>
            {retryBusy ? 'Reprocessing…' : 'Reprocess'}
          </Button>
        </div>
      ) : preparationStatus ? (
        <div className="min-h-8 shrink-0 border-b border-border px-3 py-1.5 text-sm text-muted-foreground" role="status">{preparationStatus}</div>
      ) : null}
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-sm">
        <span className="rounded border border-border bg-muted px-2 py-0.5 font-medium">Read only</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{status}</span>
        <Button variant="outline" size="xs" onClick={() => { void copySelection(); }} aria-label="Copy selected cells">Copy</Button>
        <span className="sr-only" role="status">{copyStatus === 'copied' ? 'Selected cells copied' : copyStatus === 'failed' ? 'Selected cells could not be copied' : ''}</span>
        <Button variant="outline" size="icon-xs" onClick={controller.zoomOut} disabled={!controller.canZoomOut} aria-label="Zoom out">−</Button>
        <span className="w-12 text-center tabular-nums">{controller.zoomScale}%</span>
        <Button variant="outline" size="icon-xs" onClick={controller.zoomIn} disabled={!controller.canZoomIn} aria-label="Zoom in">+</Button>
      </div>
      {controller.sheets.length > 1 ? (
        <div
          role="tablist"
          aria-label="Workbook worksheets"
          className="flex min-h-9 max-w-full shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-2"
        >
          {controller.sheets.map((sheet, index) => (
            <Button
              key={`${sheet.name}:${sheet.workbookSheetIndex}`}
              type="button"
              role="tab"
              aria-selected={controller.activeSheetIndex === index}
              variant={controller.activeSheetIndex === index ? 'secondary' : 'ghost'}
              size="sm"
              className="flex-none"
              onClick={() => controller.setActiveSheetIndex(index)}
            >
              {sheet.name}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1" onClickCapture={(event) => {
        const anchor = (event.target as Element | null)?.closest?.('a');
        if (anchor) event.preventDefault();
      }}>
        {error ? (
          <div className="grid h-full place-items-center p-8 text-center text-base text-muted-foreground" role="alert">
            <div><p className="font-medium text-foreground">This workbook cannot be previewed.</p><p className="mt-1">{error}</p></div>
          </div>
        ) : !bytes || controller.isLoading ? (
          <div className="grid h-full place-items-center text-base text-muted-foreground" role="status">Opening workbook…</div>
        ) : (
          <XlsxViewer
            controller={controller}
            height="100%"
            readOnly
            showDefaultToolbar={false}
            errorState={() => null}
            renderImage={({ image, style }) => (
              <img
                alt={image.description ?? image.name ?? ''}
                draggable={false}
                src={image.src}
                style={{ ...style, display: 'block', pointerEvents: 'none', userSelect: 'none' }}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
