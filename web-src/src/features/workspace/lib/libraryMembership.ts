import { api } from '@/common/api/api';
import type { Action, WorkspaceSlice } from '@/store/state/state';

/** Adopt the server's library membership: fetch the lightweight
 *  `/api/folder` payload and dispatch `RECENT_LOADED` from it — the one
 *  resync step behind every optimistic membership edit (favorite flips,
 *  removals, failed opens) and the background poll. `shouldAdopt` can
 *  veto the dispatch (the poll ignores unchanged lists). Rejects on
 *  fetch failure so each call site decides whether its optimistic state
 *  survives.
 *
 *  This is an imperative resync, not a hook: it lives beside the poll
 *  rather than inside it because callers outside the Workspace feature
 *  (the sidebar's favorite flip) need the resync without the interval. */
export async function refreshLibraryMembership(
  dispatch: (a: Action) => void,
  shouldAdopt?: (recent: WorkspaceSlice['recent']) => boolean,
): Promise<void> {
  const j = await api.getFolder();
  const recent = j.recent ?? [];
  if (shouldAdopt && !shouldAdopt(recent)) return;
  dispatch({ type: 'RECENT_LOADED', recent, homeDir: j.homeDir });
}
