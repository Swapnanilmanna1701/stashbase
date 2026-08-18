import { useCallback, useState } from 'react';
import { api, ApiError, errorMessage, type EmbedderProvider } from '@/common/api/api';

export interface ApiKeyEntry {
  key: string;
  busy: boolean;
  error: string | null;
  setKey: (key: string) => void;
  clearError: () => void;
  submit: () => Promise<void>;
}

/**
 * The embedder key field: its value, its in-flight state, and the save.
 *
 * `changeApiKey` validates against the provider, persists to
 * `~/.stashbase/config.json`, and rebinds the daemon, so the field stays
 * busy across a real network round trip and a rejection has to land back on
 * the field rather than as a toast — the user's next act is editing the key
 * they just typed. On success the hook stays busy: the caller is closing
 * the dialog, and re-enabling the button first only invites a second save.
 */
export function useApiKeyEntry(
  provider: EmbedderProvider,
  onSaved: (result: Awaited<ReturnType<typeof api.changeApiKey>>) => void,
): ApiKeyEntry {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const submit = useCallback(async () => {
    const k = key.trim();
    if (!k) { setError('Key required'); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await api.changeApiKey(k, provider);
      onSaved(result);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
      setBusy(false);
    }
  }, [key, provider, onSaved]);

  return { key, busy, error, setKey, clearError, submit };
}
