import type { RefObject } from 'react';
import { api } from '@/common/api/api';
import type { AppActions } from '@/store/contexts/AppContext';

/** The agent may have changed files: sync the folder this session is bound
 *  to (a library-wide chat has no bound folder — reconcile the window's
 *  current folder so the visible tree stays fresh), then refresh whichever
 *  surface shows it. Same-folder windows refresh index state; a cross-folder
 *  tab instead re-fetches its session-folder listing so mentions and
 *  attachment validation see the new files. The sync itself is best-effort
 *  in both callers — a failure falls through to the refresh, and the next
 *  status poll surfaces it.
 *
 *  Self-contained folder-sync policy: it reads only refs and `actions`, and
 *  feeds nothing back into the connection state machine, so it composes
 *  beside the session core rather than living inside it. */
export function useSessionFolderReconcile({
  sessionFolder,
  folderPathRef,
  actions,
  bumpSessionListing,
}: {
  /** The folder this session's file operations resolve against, or null for
   *  a library chat in a window with no folder open. */
  sessionFolder: () => string | null;
  folderPathRef: RefObject<string>;
  actions: AppActions;
  bumpSessionListing: () => void;
}) {
  return async function reconcileSessionFolder({ reloadWindowTree }: {
    /** Reload the window's visible file tree before the index-state
     *  refresh. The mid-turn tool-result path turns this on so new files
     *  appear immediately; the turn-end sweep leaves it off and lets the
     *  regular poll repaint the tree. */
    reloadWindowTree: boolean;
  }): Promise<void> {
    const folder = sessionFolder();
    if (!folder) return; // library chat in a no-folder window: nothing visible to reconcile
    await api.sync(folder).catch(() => { /* best-effort; next poll surfaces it */ });
    if (folderPathRef.current !== folder) {
      bumpSessionListing();
      return;
    }
    if (reloadWindowTree) {
      await actions.loadFiles(folder);
      // The reload awaited: the window may have switched folders meanwhile.
      // Re-check before touching index state — this second check is
      // deliberate, so a stale tab can never refresh another folder's
      // index chrome.
      if (folderPathRef.current !== folder) return;
    }
    void actions.refreshIndexState();
  };
}
