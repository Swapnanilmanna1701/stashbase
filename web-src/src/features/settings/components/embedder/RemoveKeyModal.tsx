/**
 * Confirmation for removing the global embedding key.
 * Without a key, indexing and search stop until the user adds one back.
 * The existing index is left untouched — nothing is deleted.
 */
import { useState } from 'react';
import { errorMessage } from '@/common/api/api';
import { ModalShell } from '@/common/components/ModalShell';
import { Button } from '@/common/components/ui/button';
import { StatusMessage } from '@/common/components/ui/status';

export function RemoveKeyModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: unknown) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Remove API key?"
      description="AI Index updates and meaning-based search stop until you add a key back. Your existing index is kept — nothing is deleted."
      onCancel={busy ? () => { /* wait for removal */ } : onCancel}
    >
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
          variant="destructive"
          onClick={submit}
          disabled={busy}
        >{busy ? 'Removing…' : 'Remove key'}</Button>
      </div>
    </ModalShell>
  );
}
