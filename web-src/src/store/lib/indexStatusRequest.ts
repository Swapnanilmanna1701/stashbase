export type IndexStatusRequestOutcome<T> =
  | { kind: 'success'; status: T }
  | { kind: 'error'; error: unknown }
  | { kind: 'stale' }
  | { kind: 'skipped' };

/** Run one active- or explicit-folder status request against the folder
 * transition that started it. Active polling has no work while no folder is
 * open or while another folder is opening, and a response becomes stale as
 * soon as a newer folder transition starts. */
export async function runIndexStatusRequest<T>({
  activeFolderPath,
  activeFolderTransitionInProgress,
  explicitFolderPath,
  openGenerationAtStart,
  getCurrentFolderPath,
  getCurrentOpenGeneration,
  request,
}: {
  activeFolderPath: string;
  activeFolderTransitionInProgress: boolean;
  explicitFolderPath?: string;
  openGenerationAtStart: number;
  getCurrentFolderPath: () => string;
  getCurrentOpenGeneration: () => number;
  request: (folderPath: string) => Promise<T>;
}): Promise<IndexStatusRequestOutcome<T>> {
  const scope = explicitFolderPath ? 'explicit' : 'active';
  const targetFolderPath = explicitFolderPath ?? activeFolderPath;
  if (
    scope === 'active'
    && (activeFolderTransitionInProgress || !targetFolderPath)
  ) {
    return { kind: 'skipped' };
  }

  // Explicit requests stay current while renderer state catches up from
  // no-folder-open (''), but never once a DIFFERENT folder is committed:
  // every consumer dispatches into active-folder-scoped state, so a
  // cross-folder response (e.g. preparing a file opened out-of-folder)
  // must land as stale instead of painting that folder's badges,
  // conversions, and warnings onto the current workspace.
  const isCurrent = () => {
    if (openGenerationAtStart !== getCurrentOpenGeneration()) return false;
    const currentFolderPath = getCurrentFolderPath();
    if (scope === 'explicit' && currentFolderPath === '') return true;
    return targetFolderPath === currentFolderPath;
  };

  try {
    const status = await request(targetFolderPath);
    return isCurrent()
      ? { kind: 'success', status }
      : { kind: 'stale' };
  } catch (error) {
    return isCurrent()
      ? { kind: 'error', error }
      : { kind: 'stale' };
  }
}
