import { folderRefsEqual } from '@/store/lib/folderPath';

/** One library membership entry as the server reports it (recents order). */
export interface LibraryListEntry {
  path: string;
  openedAt: string;
  favorite?: boolean;
}

export interface LibraryListPlan {
  /** Rows to render, favorites (all of them) first; both groups keep the
   *  input's recents order. Never contains the active folder. */
  visible: LibraryListEntry[];
}

/**
 * Ordering for the sidebar's LIBRARY resource list. The window's current
 * folder lives in the active zone above the list, so it is excluded from
 * the rows here; favorites come first, then the rest in recents order.
 * Every row renders — overflow is the fixed-height scroll container's
 * concern, not this plan's.
 */
export function libraryListPlan(
  entries: readonly LibraryListEntry[],
  activeFolderPath: string,
): LibraryListPlan {
  const rows = entries.filter(
    (entry) => !activeFolderPath || !folderRefsEqual(entry.path, activeFolderPath),
  );
  return {
    visible: [
      ...rows.filter((entry) => entry.favorite),
      ...rows.filter((entry) => !entry.favorite),
    ],
  };
}
