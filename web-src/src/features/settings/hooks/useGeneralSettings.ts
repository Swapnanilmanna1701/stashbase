import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type CapturePreferences, type UpdatePreferences } from '@/common/api/api';
import { electronBridge } from '@/common/lib/electronBridge';
import { useDesktopUpdate } from '@/common/hooks/useDesktopUpdate';

export interface GeneralSettingsController {
  capture: CapturePreferences | null;
  captureError: string | null;
  savingCapture: boolean;
  setClipboardImageImport: (enabled: boolean) => Promise<void>;

  updates: UpdatePreferences | null;
  updateError: string | null;
  savingUpdates: boolean;
  setAutomaticUpdateChecks: (enabled: boolean) => Promise<void>;

  /** The live desktop-updater state, plus the three commands the panel offers. */
  updateState: ReturnType<typeof useDesktopUpdate>['state'];
  checkNow: () => Promise<void>;
  runPrimaryAction: ReturnType<typeof useDesktopUpdate>['runPrimaryAction'];
  openDownloadPage: ReturnType<typeof useDesktopUpdate>['openDownloadPage'];
  setSimulation: ReturnType<typeof useDesktopUpdate>['setSimulation'];
}

/**
 * The General panel's two durable preferences and the desktop updater they
 * both hand off to.
 *
 * Each preference is a persisted server value with a matching main-process
 * service that must be told the value changed — clipboard watching for
 * capture, the update poller for updates. Both saves are optimistic and both
 * roll back on failure, and in both cases a save the SERVER accepted but the
 * desktop service could not apply is a distinct outcome from a save that
 * failed: the persisted value is authoritative, so the panel reports the
 * handoff rather than reverting a preference the user really did set.
 *
 * A cancelled read is dropped rather than applied — Settings is a modal, and
 * a reply landing after it closes has nothing left to paint.
 */
export function useGeneralSettings(): GeneralSettingsController {
  const [capture, setCapture] = useState<CapturePreferences | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [savingCapture, setSavingCapture] = useState(false);
  const [updates, setUpdates] = useState<UpdatePreferences | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [savingUpdates, setSavingUpdates] = useState(false);
  const { state: updateState, check, runPrimaryAction, openDownloadPage, refreshPreference, setSimulation } = useDesktopUpdate();
  // Each optimistic save needs the value it is replacing. The commands are
  // stable across renders, so they read the baseline from a ref rather than
  // closing over a render's snapshot.
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const updatesRef = useRef(updates);
  updatesRef.current = updates;

  useEffect(() => {
    let cancelled = false;
    void api.capturePreferences()
      .then((next) => {
        if (!cancelled) setCapture(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setCaptureError(errorMessage(err));
      });
    void api.updatePreferences()
      .then((next) => {
        if (!cancelled) setUpdates(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setUpdateError(errorMessage(err));
      });
    return () => { cancelled = true; };
  }, []);

  const setClipboardImageImport = useCallback(async (enabled: boolean) => {
    const previous = captureRef.current;
    if (!previous) return;
    setCapture({ ...previous, clipboardImageImport: enabled });
    setSavingCapture(true);
    setCaptureError(null);
    try {
      const saved = await api.setCapturePreferences({ clipboardImageImport: enabled });
      setCapture(saved);
      try {
        const applied = await electronBridge()?.refreshClipboardWatch?.();
        if (applied !== undefined && applied !== saved.clipboardImageImport) {
          setCaptureError('Saved, but the desktop capture service could not apply the change. Restart StashBase to retry.');
        }
      } catch {
        setCaptureError('Saved, but the desktop capture service could not apply the change. Restart StashBase to retry.');
      }
    } catch (err: unknown) {
      setCapture(previous);
      try {
        await electronBridge()?.refreshClipboardWatch?.();
      } catch { /* The persisted setting remains the authority. */ }
      setCaptureError(errorMessage(err));
    } finally {
      setSavingCapture(false);
    }
  }, []);

  const setAutomaticUpdateChecks = useCallback(async (enabled: boolean) => {
    const previous = updatesRef.current;
    if (!previous) return;
    setUpdates({ autoCheck: enabled });
    setSavingUpdates(true);
    setUpdateError(null);
    try {
      const saved = await api.setUpdatePreferences({ autoCheck: enabled });
      setUpdates(saved);
      try {
        await refreshPreference();
      } catch {
        setUpdateError('Saved, but the desktop update service could not apply the change. Restart StashBase to retry.');
      }
    } catch (err: unknown) {
      setUpdates(previous);
      setUpdateError(errorMessage(err));
    } finally {
      setSavingUpdates(false);
    }
  }, [refreshPreference]);

  const checkNow = useCallback(async () => {
    setUpdateError(null);
    try {
      await check();
    } catch (err: unknown) {
      setUpdateError(errorMessage(err));
    }
  }, [check]);

  return {
    capture,
    captureError,
    savingCapture,
    setClipboardImageImport,
    updates,
    updateError,
    savingUpdates,
    setAutomaticUpdateChecks,
    updateState,
    checkNow,
    runPrimaryAction,
    openDownloadPage,
    setSimulation,
  };
}
