import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createLatestReportRequest, reportBugBridge, type ReportDraft, type ReportInput } from '../reportBug';
import { ErrorBoundary, lazyWithRetry } from './ErrorBoundary';

const LazyReportBugSurface = lazyWithRetry(() => import('./ReportBugSurface'));

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

export function ReportBugController({ children, initialErrorDetails }: {
  children: (state: ReportBugControllerState) => ReactNode;
  initialErrorDetails?: string;
}) {
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
    void prepare(initialErrorDetails);
    return () => requests.current.invalidate();
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

export default function ReportBugDialog({ initialErrorDetails = '' }: { initialErrorDetails?: string }) {
  return <ReportBugController initialErrorDetails={initialErrorDetails}>{(state) => <ErrorBoundary key={state.surfaceGeneration}>
    <Suspense fallback={null}>{state.open && <LazyReportBugSurface {...state} />}</Suspense>
  </ErrorBoundary>}</ReportBugController>;
}
