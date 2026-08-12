import { useEffect, useState } from 'react';
import type { ReportBugBridge } from '../reportBug';
import { lazyWithRetry } from './ErrorBoundary';

const LazyReportBugDialog = lazyWithRetry(() => import('./ReportBugDialog'));

interface ReportRequest {
  id: number;
  errorDetails: string;
}

export function ReportBugLauncher() {
  const [request, setRequest] = useState<ReportRequest | null>(null);

  useEffect(() => {
    const open = (errorDetails = '') => setRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      errorDetails,
    }));
    const bridge = (window as unknown as { electron?: { reportBug?: ReportBugBridge } }).electron?.reportBug;
    const unsubscribe = bridge?.onOpen(() => open());
    const listener = (event: Event) => open((event as CustomEvent<{ errorDetails?: string }>).detail?.errorDetails || '');
    window.addEventListener('stashbase-report-bug', listener);
    return () => { unsubscribe?.(); window.removeEventListener('stashbase-report-bug', listener); };
  }, []);

  return request && <LazyReportBugDialog key={request.id} initialErrorDetails={request.errorDetails} />;
}
