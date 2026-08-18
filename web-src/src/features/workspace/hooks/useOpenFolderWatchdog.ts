import { useEffect } from 'react';
import { useLatestRef } from '@/common/hooks/useLatestRef';

const OPEN_FOLDER_WATCHDOG_MS = 20_000;

/** Watchdog for a library-row folder open: an open that neither resolves
 *  nor rejects should not leave the row stuck in its busy state forever.
 *  `onTimeout` is read through a ref so a fresh callback identity never
 *  restarts the countdown — only a new `opening` target does. */
export function useOpenFolderWatchdog(
  opening: { path: string; name: string } | null,
  onTimeout: (opening: { path: string; name: string }) => void,
): void {
  const onTimeoutRef = useLatestRef(onTimeout);
  useEffect(() => {
    if (!opening) return undefined;
    const timer = setTimeout(() => onTimeoutRef.current(opening), OPEN_FOLDER_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [opening]);
}
