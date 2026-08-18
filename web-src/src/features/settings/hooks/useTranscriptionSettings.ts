import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  errorMessage,
  type TranscriptionModelId,
  type TranscriptionSettings,
} from '@/common/api/api';
import { useAppActions } from '@/store/contexts/AppContext';

export interface TranscriptionSettingsController {
  settings: TranscriptionSettings | null;
  error: string | null;
  /** The model a download or removal is currently running against. */
  busyModel: TranscriptionModelId | null;
  retry: () => void;
  chooseModel: (providerId: string, modelId: string) => Promise<void>;
  chooseLanguage: (language: string) => Promise<void>;
  download: (modelId: TranscriptionModelId) => Promise<void>;
  remove: (modelId: TranscriptionModelId, confirmRemoval?: boolean) => Promise<void>;
}

/**
 * Transcription provider, model, and language settings, plus the model
 * download/removal commands.
 *
 * Two guards are the reason this is a hook rather than four calls in the
 * panel. A download reports progress only through the settings payload, so
 * the read re-polls itself while any model is downloading or verifying. And
 * a preference write is optimistic: `preferenceGeneration` marks each one,
 * so an in-flight read from before the write can never repaint the older
 * server truth over the choice the user just made.
 */
export function useTranscriptionSettings(): TranscriptionSettingsController {
  const { actions } = useAppActions();
  const [settings, setSettings] = useState<TranscriptionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyModel, setBusyModel] = useState<TranscriptionModelId | null>(null);
  const [nonce, setNonce] = useState(0);
  const preferenceGeneration = useRef(0);

  const load = useCallback(async (expectedGeneration = preferenceGeneration.current) => {
    const next = await api.transcriptionSettings();
    if (expectedGeneration !== preferenceGeneration.current) return next;
    setSettings(next);
    setError(null);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      const expectedGeneration = preferenceGeneration.current;
      try {
        const next = await api.transcriptionSettings();
        if (cancelled) return;
        if (expectedGeneration === preferenceGeneration.current) {
          setSettings(next);
          setError(null);
        }
        if (next.providers.some((provider) => provider.models.some((model) => (
          model.operation?.status === 'downloading' || model.operation?.status === 'verifying'
        )))) {
          timer = setTimeout(refresh, 700);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(errorMessage(err));
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);

  const chooseModel = useCallback(async (providerId: string, modelId: string) => {
    if (!settings || (settings.providerId === providerId && modelId === settings.modelId)) return;
    const generation = ++preferenceGeneration.current;
    setSettings({ ...settings, providerId, modelId });
    try {
      await api.setTranscriptionPreferences({ providerId, modelId });
      if (generation === preferenceGeneration.current) setNonce((value) => value + 1);
    } catch (err: unknown) {
      if (generation !== preferenceGeneration.current) return;
      setError(errorMessage(err));
      void load(generation).catch(() => undefined);
    }
  }, [settings, load]);

  const chooseLanguage = useCallback(async (language: string) => {
    if (!settings) return;
    const generation = ++preferenceGeneration.current;
    const previous = settings.language;
    setSettings({ ...settings, language });
    try {
      await api.setTranscriptionPreferences({ language });
      if (generation === preferenceGeneration.current) setNonce((value) => value + 1);
    } catch (err: unknown) {
      if (generation !== preferenceGeneration.current) return;
      setSettings((current) => current ? { ...current, language: previous } : current);
      setError(errorMessage(err));
    }
  }, [settings]);

  const download = useCallback(async (modelId: TranscriptionModelId) => {
    setBusyModel(modelId);
    setError(null);
    try {
      await api.downloadTranscriptionModel(modelId);
      setNonce((value) => value + 1);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusyModel(null);
    }
  }, []);

  const remove = useCallback(async (modelId: TranscriptionModelId, confirmRemoval = true) => {
    if (confirmRemoval) {
      const confirmed = await actions.confirm(
        `Remove the downloaded ${modelId} transcription model? Existing transcripts stay available.`,
        { title: 'Remove transcription model?', confirmLabel: 'Remove', destructive: true },
      );
      if (!confirmed) return;
    }
    setBusyModel(modelId);
    setError(null);
    try {
      await api.removeTranscriptionModel(modelId);
      setNonce((value) => value + 1);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusyModel(null);
    }
  }, [actions]);

  return { settings, error, busyModel, retry, chooseModel, chooseLanguage, download, remove };
}
