import { useEffect } from 'react';
import type { Action, WorkspaceSlice } from '@/store/state/state';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { refreshLibraryMembership } from '@/features/workspace/lib/libraryMembership';

const MEMBERSHIP_POLL_MS = 4000;

/** Library membership can change without this window acting: an agent's
 *  create_project in another window, or an external MCP client. There is
 *  no server→renderer membership push, so poll the lightweight
 *  `/api/folder` while the library list is visible and adopt the list
 *  only when the member set/order actually changed (openedAt churn is
 *  ignored — recency labels refresh on the next explicit action). */
export function useLibraryMembership(
  enabled: boolean,
  recent: WorkspaceSlice['recent'],
  dispatch: (a: Action) => void,
): void {
  // Read through a ref: adopting a fresh list must not restart the
  // interval, so the current membership key stays out of the deps.
  const recentKeyRef = useLatestRef(recent.map((r) => r.path).join('\n'));
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const timer = setInterval(() => {
      void refreshLibraryMembership(
        dispatch,
        (fresh) => !cancelled && fresh.map((r) => r.path).join('\n') !== recentKeyRef.current,
      ).catch(() => { /* transient; next tick retries */ });
    }, MEMBERSHIP_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dispatch, enabled]);
}
