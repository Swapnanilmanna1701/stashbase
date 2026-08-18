import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/common/api/api';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { useWorkspace } from '@/store/contexts/AppContext';

export interface FileReprocess {
  retryBusy: boolean;
  retryError: string | null;
  /** True once the server accepted the request for the file still on screen. */
  retry: () => Promise<boolean>;
}

/**
 * The Reprocess command a preview offers when its file failed preparation.
 *
 * A reprocess outlives the view that started it: the request is slow enough
 * that the user can switch documents or folders while it is in flight, and
 * the reply would then land on a preview showing something else. Every
 * outcome is therefore checked against the file still on screen before it
 * writes state, and the result is reported for the current file only.
 *
 * The folder is captured at the call, not read at the reply, so a reprocess
 * always targets the file the user acted on even if the workspace moved.
 */
export function useFileReprocess(
  name: string | null,
  source: { folder?: string; version?: string } = {},
): FileReprocess {
  const { folder: sourceFolder, version: sourceVersion } = source;
  const state = useWorkspace();
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const currentRef = useLatestRef({ folderPath: state.folderPath, name });

  useEffect(() => {
    setRetryBusy(false);
    setRetryError(null);
    // A version bump after a successful reprocess is a new file, so the
    // next retry starts from scratch rather than inheriting this one's error.
  }, [name, sourceFolder, sourceVersion]);

  async function retry(): Promise<boolean> {
    if (!name) return false;
    setRetryBusy(true);
    setRetryError(null);
    const folderPathAtStart = state.folderPath;
    const nameAtStart = name;
    const stillCurrent = () =>
      currentRef.current.folderPath === folderPathAtStart && currentRef.current.name === nameAtStart;
    try {
      await api.reprocessFile(name, { folder: sourceFolder ?? (folderPathAtStart || undefined) });
      // The failures list / banner clear on the next index-status poll.
      return stillCurrent();
    } catch (err: unknown) {
      if (stillCurrent()) setRetryError(errorMessage(err));
      return false;
    } finally {
      if (stillCurrent()) setRetryBusy(false);
    }
  }

  return { retryBusy, retryError, retry };
}
