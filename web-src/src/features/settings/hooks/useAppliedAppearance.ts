import { useEffect } from 'react';
import { api } from '@/common/api/api';
import { applyAppearance, subscribeToAppearance } from '@/features/settings/lib/appearance';

/**
 * Apply the saved appearance to this window, once at boot and thereafter
 * whenever another window saves a change.
 *
 * The subscription is established before the read so a save that lands
 * mid-request wins: the broadcast is newer than the snapshot in flight, and
 * a late GET must not repaint the window with the theme the user just
 * changed away from.
 *
 * A failed read is deliberately silent. The initial light/system-safe CSS
 * stays usable if the config is absent or temporarily unreadable, and
 * Settings is the surface that reports the recoverable error.
 */
export function useAppliedAppearance(): void {
  useEffect(() => {
    let receivedWindowUpdate = false;
    const unsubscribe = subscribeToAppearance((preferences) => {
      receivedWindowUpdate = true;
      applyAppearance(preferences);
    });
    void api.appearance().then((preferences) => {
      if (!receivedWindowUpdate) applyAppearance(preferences);
    }).catch(() => { /* Settings exposes the recoverable error */ });
    return unsubscribe;
  }, []);
}
