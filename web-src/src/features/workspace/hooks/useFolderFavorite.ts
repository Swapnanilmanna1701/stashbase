import { useCallback } from 'react';
import { api, errorMessage } from '@/common/api/api';
import { useWorkspace } from '@/store/contexts/AppContext';
import type { Action } from '@/store/state/state';
import { refreshLibraryMembership } from '@/features/workspace/lib/libraryMembership';

/** The library's star toggle for one member folder. Optimistic: flip in
 *  the store immediately, persist in the background, and re-sync from the
 *  server if the write fails. Toggling an unknown path is a no-op — the
 *  membership list is what defines the current flag. */
export function useFolderFavorite(
  dispatch: (a: Action) => void,
  toast: (message: string, opts?: { level?: 'info' | 'success' | 'warning' | 'error' }) => void,
): (path: string) => void {
  const { recent, homeDir } = useWorkspace();

  return useCallback((path: string) => {
    const entry = recent.find((r) => r.path === path);
    if (!entry) return;
    const favorite = !entry.favorite;
    dispatch({
      type: 'RECENT_LOADED',
      recent: recent.map((r) => (r.path === path ? { ...r, favorite } : r)),
      homeDir,
    });
    void api.setFolderFavorite(path, favorite).catch((e) => {
      toast(errorMessage(e), { level: 'error' });
      void refreshLibraryMembership(dispatch)
        .catch(() => { /* keep the optimistic flip until the next refresh */ });
    });
  }, [dispatch, homeDir, recent, toast]);
}
