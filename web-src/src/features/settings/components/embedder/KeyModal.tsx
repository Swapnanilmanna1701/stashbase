/**
 * Embedding key entry modal. The caller persists through
 * `/api/embedder/key`, which rejects definite provider auth failures
 * before writing config.
 * `mode='change'` only swaps the title + button text.
 */
import { useRef, useState } from 'react';
import type { EmbedderProvider } from '@/common/api/api';
import { errorMessage } from '@/common/api/api';
import { ModalShell } from '@/common/components/ModalShell';
import { Button } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';
import { StatusMessage } from '@/common/components/ui/status';

export function KeyModal({
  mode = 'enter',
  provider,
  model,
  placeholder,
  onCancel,
  onSaved,
}: {
  mode?: 'enter' | 'change';
  provider: EmbedderProvider;
  model: string;
  placeholder: string;
  onCancel: () => void;
  onSaved: (key: string) => void | Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function submit() {
    const trimmed = key.trim();
    if (!trimmed) { setError('Key required'); return; }
    setBusy(true);
    setError(null);
    try {
      // The caller saves via changeApiKey, whose server route rejects
      // definite provider auth failures; don't preflight here or successful
      // saves pay for two validation calls.
      await onSaved(trimmed);
    } catch (err: unknown) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={mode === 'change' ? 'Change API key' : `${providerLabel(provider)} API key`}
      description={mode === 'change'
        ? `Replaces your ${providerLabel(provider)} key for ${model}.`
        : `Used only for embeddings with ${model} — never for chat or completions.`}
      initialFocus={inputRef}
      onCancel={onCancel}
    >
      <Input
        ref={inputRef}
        type="password"
        className="font-mono text-sm"
        placeholder={placeholder}
        autoComplete="off"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit(); }
        }}
      />
      {error && (
        <StatusMessage tone="error" className="mt-2.5 max-h-[min(180px,32vh)] overflow-y-auto wrap-anywhere">
          {error}
        </StatusMessage>
      )}
      <div className="mt-3.5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={busy}
        >{busy ? 'Validating…' : (mode === 'change' ? 'Save' : 'Continue')}</Button>
      </div>
    </ModalShell>
  );
}

function providerLabel(provider: EmbedderProvider): string {
  return provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
}
