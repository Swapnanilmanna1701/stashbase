import { useEffect, useRef } from 'react';
import { api } from '@/common/api/api';

const LIBRARY_RECONCILE_COOLDOWN_MS = 30_000;
const RECONCILE_START_DELAY_MS = 1500;

/** Background reconcile for the non-current library folders, with a
 *  per-folder cooldown: previous library work (conversions, indexing)
 *  may still be incomplete, and status polling alone is not recovery.
 *  `pathsKey` is the newline-joined member paths (hidden rows included —
 *  recovery must not depend on what is on screen). */
export function useLibraryReconcile(enabled: boolean, pathsKey: string): void {
  const reconcileStartedAt = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const paths = pathsKey ? pathsKey.split('\n') : [];
    if (!enabled || paths.length === 0) return undefined;
    const timer = setTimeout(() => {
      const now = Date.now();
      for (const path of paths) {
        const lastStarted = reconcileStartedAt.current.get(path) ?? 0;
        if (now - lastStarted < LIBRARY_RECONCILE_COOLDOWN_MS) continue;
        reconcileStartedAt.current.set(path, now);
        void api.sync(path)
          .catch((err) => {
            console.warn(`[library] reconcile failed for ${path}:`, err);
          });
      }
    }, RECONCILE_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, pathsKey]);
}
