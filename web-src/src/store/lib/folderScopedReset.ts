/**
 * Pure dispatch plan for clearing folder-scoped renderer state when the
 * window's folder context changes.
 *
 * Two distinct transitions share most of the plan:
 *
 * - `'switch'` — the window navigates to another library folder (sidebar
 *   root click, Open Folder…). Document tabs and preparation state belong
 *   to the old folder and reset. Search does NOT: the search popup is
 *   library-scoped and keeps its state outside the reducer
 *   (`librarySearch.ts`), precisely so its own cross-folder result-opens
 *   cannot wipe it. Chat tabs do NOT either: every
 *   agent session is pinned server-side to an explicit member folder, so
 *   the tabs and their running sessions survive the switch. Bound tabs
 *   keep their binding (the pane header marks cross-folder chats);
 *   unbound empty tabs follow the new window folder on their next
 *   connect.
 * - `'folder-lost'` — the window loses its folder context entirely
 *   (library removal, another window closing the folder). Chat tabs
 *   reset too: the server ends the affected sessions, and panels must
 *   not keep rendering against a folder that is gone.
 */
import type { Action } from '@/store/state/state';

export type FolderResetReason = 'switch' | 'folder-lost';

/**
 * Clears every folder-scoped PREPARATION indicator: the readiness, queue,
 * progress, and failure state that describes one folder's files and would
 * otherwise bleed into the next folder — or into the no-folder view — as a
 * stale banner.
 *
 * This is the single source both folder-context-clearing sites consume: the
 * `folderScopedResetActions` plan below, and the 412 index-status recovery
 * ladder (`recoverLostFolderContext` in `hooks/useSearchActions.ts`), which
 * clears these indicators even when no folder is open. Add a folder-scoped
 * indicator field to `State` and its reset belongs HERE — both sites pick it
 * up, and `__tests__/folder-scoped-reset.test.ts` fails if either site grows
 * a divergent inline ladder instead.
 *
 * The two sites do NOT share the workspace half (`TABS_RESET`,
 * `CHAT_TABS_RESET`, `ACTIVE_FOLDER`, `FILE_ORDER_LOADED`): the plan below
 * runs it around this block, while the recovery ladder runs it after and only
 * when a folder was visibly open. Both orders are observable, so neither is
 * bent to fit the other.
 */
export function folderScopedPreparationResetActions(): Action[] {
  return [
    { type: 'PENDING_SEMANTIC_NAMES', names: {} },
    { type: 'PENDING_CONVERSIONS', paths: [] },
    { type: 'BLOCKED_CONVERSIONS', paths: [] },
    { type: 'CONVERSION_PROGRESS', progress: {} },
    { type: 'CONVERSION_SCHEDULER_STATE', revision: 0, versions: {} },
    { type: 'INDEX_WARNING', warning: null },
    { type: 'PREPARATION_FAILURES', failures: [] },
    { type: 'SYNC_RUNNING', running: false },
  ];
}

export function folderScopedResetActions(reason: FolderResetReason): Action[] {
  return [
    { type: 'TABS_RESET' },
    ...(reason === 'folder-lost' ? [{ type: 'CHAT_TABS_RESET' } as Action] : []),
    { type: 'ACTIVE_FOLDER', path: '' },
    ...folderScopedPreparationResetActions(),
    { type: 'FILE_ORDER_LOADED', order: {} },
  ];
}
