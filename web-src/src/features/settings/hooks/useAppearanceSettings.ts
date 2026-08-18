import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, type AppearancePreferences } from '@/common/api/api';
import { applyAppearance, publishAppearance, subscribeToAppearance } from '@/features/settings/lib/appearance';

export interface AppearanceSettingsController {
  preferences: AppearancePreferences | null;
  error: string | null;
  saving: boolean;
  save: (next: Partial<AppearancePreferences>) => Promise<void>;
}

/**
 * The appearance panel's preferences, and the optimistic save that applies
 * them to every open window.
 *
 * Appearance is multi-window state, which is what both guards are for. A
 * save in another window broadcasts, so a read that is still in flight when
 * one arrives must not repaint the panel with the snapshot it started from.
 * And a save publishes optimistically before the server answers, so its
 * rollback is gated on `revision`: only the newest write may undo itself,
 * or a failed older save would revert a newer successful one.
 */
export function useAppearanceSettings(): AppearanceSettingsController {
  const [preferences, setPreferences] = useState<AppearancePreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let receivedWindowUpdate = false;
    const unsubscribe = subscribeToAppearance((next) => {
      receivedWindowUpdate = true;
      revisionRef.current += 1;
      if (!cancelled) setPreferences(next);
    });
    api.appearance()
      .then((next) => {
        // A save in another window can arrive while this request is in
        // flight. Its broadcast is newer than this snapshot, so never let a
        // late GET roll the panel (or this window) back to stale values.
        if (cancelled || receivedWindowUpdate) return;
        setPreferences(next);
        // The app shell normally applies this on startup. Keep this local
        // fallback for a recoverable shell-load failure, but initial reads
        // must not broadcast and overwrite newer choices in other windows.
        applyAppearance(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function save(next: Partial<AppearancePreferences>) {
    if (!preferences) return;
    const optimistic = { ...preferences, ...next };
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setPreferences(optimistic);
    setSaving(true);
    setError(null);
    publishAppearance(optimistic);
    try {
      const saved = await api.setAppearance(next);
      setPreferences(saved);
      publishAppearance(saved);
    } catch (err: unknown) {
      if (revisionRef.current === revision) {
        setPreferences(preferences);
        publishAppearance(preferences);
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return { preferences, error, saving, save };
}
