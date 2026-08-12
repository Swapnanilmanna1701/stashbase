import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createLatestReportRequest, GITHUB_FIELD_MAX_LENGTH, reportBugBridge, type ReportDraft, type ReportInput } from '../reportBug';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useOverlayLayer } from './OverlayStack';
import { Textarea } from './ui/textarea';
import { ErrorBoundary } from './ErrorBoundary';

export interface ReportFormState {
  happened: string;
  expected: string;
  steps: string;
  includeScreenshot: boolean;
  includeLogs: boolean;
  includeErrorDetails: boolean;
}

export function initialReportFormState(draft?: ReportDraft): ReportFormState {
  return {
    happened: '', expected: '', steps: '',
    includeScreenshot: true,
    includeLogs: true,
    includeErrorDetails: Boolean(draft?.errorDetails),
  };
}

interface ReportDialogState {
  open: boolean;
  draft: ReportDraft | null;
}

type ReportDialogEvent =
  | { type: 'capture-started' }
  | { type: 'capture-completed'; draft: ReportDraft };

export function reportDialogTransition(state: ReportDialogState, event: ReportDialogEvent): ReportDialogState {
  if (event.type === 'capture-started') return { open: false, draft: null };
  return { open: true, draft: event.draft };
}

export interface ReportBugControllerState {
  open: boolean;
  draft: ReportDraft | null;
  form: ReportFormState;
  status: string;
  busy: boolean;
  surfaceGeneration: number;
  patchForm: (patch: Partial<ReportFormState>) => void;
  act: (kind: 'copy' | 'save' | 'submit') => Promise<void>;
  close: () => void;
}

export function ReportBugController({ children }: { children: (state: ReportBugControllerState) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [form, setForm] = useState<ReportFormState>(() => initialReportFormState());
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [surfaceGeneration, setSurfaceGeneration] = useState(0);
  const requests = useRef(createLatestReportRequest());
  const patchForm = (patch: Partial<ReportFormState>) => setForm((current) => ({ ...current, ...patch }));

  async function prepare(capturedError = '') {
    if (busyRef.current) return;
    const bridge = reportBugBridge();
    if (!bridge) return;
    const request = requests.current.begin();
    const capturing = reportDialogTransition({ open: false, draft: null }, { type: 'capture-started' });
    setOpen(capturing.open);
    setDraft(capturing.draft);
    setForm(initialReportFormState());
    setStatus('');
    try {
      const prepared = await bridge.prepare({ errorDetails: capturedError, requestId: String(request) });
      if (!requests.current.isCurrent(request)) return;
      const review = reportDialogTransition(capturing, { type: 'capture-completed', draft: prepared });
      setDraft(review.draft);
      setForm(initialReportFormState(prepared));
      setStatus('');
      setOpen(review.open);
      setSurfaceGeneration((generation) => generation + 1);
    } catch (error) {
      if (requests.current.isCurrent(request)) {
        setStatus(error instanceof Error ? error.message : 'Could not prepare the report.');
        setOpen(true);
      }
    }
  }

  useEffect(() => {
    const bridge = reportBugBridge();
    const unsubscribe = bridge?.onOpen(() => { void prepare(); });
    const listener = (event: Event) => { void prepare((event as CustomEvent<{ errorDetails?: string }>).detail?.errorDetails || ''); };
    window.addEventListener('stashbase-report-bug', listener);
    return () => { unsubscribe?.(); window.removeEventListener('stashbase-report-bug', listener); };
  }, []);

  const input = (): ReportInput => ({ id: draft!.id, ...form });
  async function act(kind: 'copy' | 'save' | 'submit') {
    if (!draft || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatus(kind === 'submit' ? 'Opening GitHub…' : `${kind === 'copy' ? 'Copying' : 'Saving'} report…`);
    try {
      const result = await reportBugBridge()?.[kind](input());
      setStatus(kind === 'submit' && result && typeof result === 'object' ? result.message : kind === 'copy' ? 'Report details copied.' : result ? 'Report saved.' : 'Save cancelled.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Report action failed.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return children({
    open, draft, form, status, busy, surfaceGeneration, patchForm, act,
    close: () => { requests.current.invalidate(); setOpen(false); },
  });
}

export function ReportBugDialog() {
  return <ReportBugController>{(state) => <ErrorBoundary key={state.surfaceGeneration}>
    <ReportBugSurface {...state} />
  </ErrorBoundary>}</ReportBugController>;
}

interface ReportBugSurfaceProps {
  open: boolean;
  draft: ReportDraft | null;
  form: ReportFormState;
  status: string;
  busy: boolean;
  patchForm: (patch: Partial<ReportFormState>) => void;
  act: (kind: 'copy' | 'save' | 'submit') => Promise<void>;
  close: () => void;
}

export function ReportBugSurface({ open, draft, form, status, busy, patchForm, act, close }: ReportBugSurfaceProps) {
  const layer = useOverlayLayer(open);
  return <Dialog open={open} onOpenChange={(nextOpen) => {
    if (!nextOpen && !busy && layer.isTopmost) close();
  }}>
    <DialogContent
      className={`!w-[min(760px,calc(100vw-32px))] !max-w-none max-h-[calc(100vh-32px)] overflow-auto${layer.isTopmost ? ' !z-[10001]' : ''}`}
      overlayClassName={layer.isTopmost ? 'top !z-[10000]' : undefined}
    >
      <DialogHeader>
        <DialogTitle>Report a bug</DialogTitle>
        <DialogDescription>Review everything before sharing. StashBase uploads nothing automatically; continuing sends the prefilled fields to GitHub in your browser, where you choose whether to submit.</DialogDescription>
      </DialogHeader>
      {!draft ? <p>{status}</p> : <div className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">What happened?<Textarea disabled={busy} maxLength={GITHUB_FIELD_MAX_LENGTH} className="min-h-16 font-normal" value={form.happened} onChange={(e) => patchForm({ happened: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">What did you expect?<Textarea disabled={busy} maxLength={GITHUB_FIELD_MAX_LENGTH} className="min-h-16 font-normal" value={form.expected} onChange={(e) => patchForm({ expected: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Steps to reproduce<Textarea disabled={busy} maxLength={GITHUB_FIELD_MAX_LENGTH} className="min-h-20 font-normal" value={form.steps} onChange={(e) => patchForm({ steps: e.target.value })} /></label>
        <section className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 font-medium"><Checkbox disabled={busy} checked={form.includeScreenshot} onCheckedChange={(checked) => patchForm({ includeScreenshot: checked })} /> Include current-window screenshot</label>
          {form.includeScreenshot && <img className="max-h-56 w-full rounded border border-border object-contain bg-pane" src={draft.screenshotDataUrl} alt="Current StashBase window captured for the report" />}
        </section>
        <section className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 font-medium"><Checkbox disabled={busy} checked={form.includeLogs} onCheckedChange={(checked) => patchForm({ includeLogs: checked })} /> Include recent application log</label>
          {form.includeLogs && <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-pane p-2 text-xs">{draft.logExcerpt || '(No log was available.)'}</pre>}
        </section>
        {draft.errorDetails && <section className="grid gap-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 font-medium"><Checkbox disabled={busy} checked={form.includeErrorDetails} onCheckedChange={(checked) => patchForm({ includeErrorDetails: checked })} /> Include renderer error details</label>
          {form.includeErrorDetails && <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-pane p-2 text-xs">{draft.errorDetails}</pre>}
        </section>}
        <section className="rounded-lg border border-border p-3 text-xs">
          <div className="font-medium">Diagnostics</div>
          <div>StashBase {draft.diagnostics.version} · {draft.diagnostics.platform} {draft.diagnostics.release} · {draft.diagnostics.arch} · {draft.diagnostics.packaged ? 'packaged' : 'development'} · {draft.diagnostics.timestamp}</div>
        </section>
        {status && <p className="m-0 text-sm">{status}</p>}
      </div>}
      <DialogFooter>
        <Button variant="outline" disabled={!draft || busy} onClick={() => void act('copy')}>Copy details</Button>
        <Button variant="outline" disabled={!draft || busy} onClick={() => void act('save')}>Save report</Button>
        <Button disabled={!draft || busy} onClick={() => void act('submit')}>Continue to GitHub</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
