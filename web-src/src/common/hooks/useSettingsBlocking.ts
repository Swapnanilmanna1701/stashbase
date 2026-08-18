import { useEffect, useState } from 'react';

export const OVERLAY_BLOCKING_EVENT = 'stashbase-overlay-blocking';

/** Tracks Settings' local `stashbase-overlay-blocking` announcement — the
 *  one blocking surface that lives outside the reducer, so topmost pickers
 *  (Quick Open, Editor History) can't open over it. */
export function useSettingsBlocking(): boolean {
  const [blocking, setBlocking] = useState(false);
  useEffect(() => {
    const onBlocking = (event: Event) => setBlocking((event as CustomEvent<boolean>).detail === true);
    window.addEventListener(OVERLAY_BLOCKING_EVENT, onBlocking);
    return () => window.removeEventListener(OVERLAY_BLOCKING_EVENT, onBlocking);
  }, []);
  return blocking;
}
