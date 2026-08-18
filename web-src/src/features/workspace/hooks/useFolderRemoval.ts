import { useCallback, useState } from 'react';
import { api, errorMessage } from '@/common/api/api';
import { electronBridge } from '@/common/lib/electronBridge';
import type { Action } from '@/store/state/state';
import { refreshLibraryMembership } from '@/features/workspace/lib/libraryMembership';

/** The sidebar's remove-folder confirm flow. `pendingRemoval` is the
 *  member path awaiting confirmation (it drives the confirm modal);
 *  `removing` marks the in-flight removal. The removal itself first
 *  crosses the multi-window save barrier (`prepareFolderRemoval` lets
 *  every other window flush its current edit), then removes the
 *  membership server-side, notifies the other windows, and resyncs the
 *  library list. Removal never deletes the user folder on disk. */
export function useFolderRemoval(
  dispatch: (a: Action) => void,
  toast: (message: string, opts?: { level?: 'info' | 'success' | 'warning' | 'error' }) => void,
): {
  pendingRemoval: string | null;
  removing: boolean;
  requestRemoval: (path: string) => void;
  cancelRemoval: () => void;
  removeFolder: (path: string) => void;
} {
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const bridge = electronBridge();

  const removeFolder = useCallback((path: string) => {
    setRemoving(true);
    void (async () => {
      if (bridge?.prepareFolderRemoval) {
        const ready = await bridge.prepareFolderRemoval(path);
        if (!ready) {
          throw new Error('Another window could not save its current edit. The folder was not removed.');
        }
      }
      await api.removeFolder(path);
      await bridge?.notifyFolderRemoved?.(path);
      dispatch({ type: 'LIBRARY_FOLDER_STATUS_REMOVE', path });
      await refreshLibraryMembership(dispatch);
    })()
      .catch((e) => toast(errorMessage(e), { level: 'error' }))
      .finally(() => { setRemoving(false); setPendingRemoval(null); });
  }, [bridge, dispatch, toast]);

  const requestRemoval = useCallback((path: string) => setPendingRemoval(path), []);
  const cancelRemoval = useCallback(() => setPendingRemoval(null), []);

  return { pendingRemoval, removing, requestRemoval, cancelRemoval, removeFolder };
}
