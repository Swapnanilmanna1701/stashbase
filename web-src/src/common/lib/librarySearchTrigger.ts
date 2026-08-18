/** How any surface asks the library search popup to open, and the seed it
 * may carry. The popup that listens stays in the Search feature; only the
 * request entry point and its payload vocabulary are shared. */

import type { LibraryScope } from '@/common/lib/libraryScope';

export type LibrarySearchMode = 'semantic' | 'keyword';

export interface LibrarySearchPrefill {
  query?: string;
  mode?: LibrarySearchMode;
  scope?: LibraryScope;
}

export const OPEN_LIBRARY_SEARCH_EVENT = 'stashbase-open-library-search';

/** Open the library search popup, optionally seeding its remembered state
 *  (the FindBar's "search all files" handoff passes query + exact-mode
 *  options). Same pubsub idiom as `openSettings`. */
export function openLibrarySearch(prefill?: LibrarySearchPrefill): void {
  window.dispatchEvent(new CustomEvent(OPEN_LIBRARY_SEARCH_EVENT, { detail: prefill ?? null }));
}
