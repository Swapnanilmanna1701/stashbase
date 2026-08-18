/** Pure library/folder scope vocabulary shared by the composer's
 * session-scope pill, the workspace scope picker, and library search.
 *
 * Scope model: a chat or search is explicitly scoped either to one
 * library folder or to the whole library. A missing choice is NOT a
 * scope — callers resolve their own default (e.g. the window's current
 * folder) on top of this vocabulary.
 */

import { basename } from '@/common/lib/paths';

/** Explicit library scope: one library folder, or the whole library. */
export type LibraryScope = { kind: 'library' } | { kind: 'folder'; path: string };

export const LIBRARY_SCOPE: LibraryScope = { kind: 'library' };

export function folderScope(path: string): LibraryScope {
  return { kind: 'folder', path };
}

export function libraryScopesEqual(a: LibraryScope | null | undefined, b: LibraryScope | null | undefined): boolean {
  if (!a || !b) return a === b || (!a && !b);
  if (a.kind === 'library') return b.kind === 'library';
  return b.kind === 'folder' && b.path === a.path;
}

/** What a history menu can list: one library scope, or every session across
 *  the library ('all' — the New Chat row's global history). `all` exists
 *  only for history; connect requests always bind a concrete LibraryScope. */
export type HistoryScope = LibraryScope | { kind: 'all' };

/** The New Chat row's global history scope. */
export const ALL_HISTORY_SCOPE: HistoryScope = { kind: 'all' };

export interface LibraryFolderOption {
  path: string;
  favorite?: boolean;
}

/** Folder entries for the picker: the same membership list the sidebar
 * shows (`state.recent`), favorites pinned first, both groups keeping the
 * server's recents order. The current window folder is ensured so the
 * default choice is always present even before recents load. The
 * "Library" entry is rendered separately above these. */
export function folderMenuEntries(
  recent: readonly { path: string; favorite?: boolean }[],
  windowFolder: string,
): LibraryFolderOption[] {
  const favorites = recent.filter((entry) => entry.favorite);
  const others = recent.filter((entry) => !entry.favorite);
  const ordered: LibraryFolderOption[] = [...favorites, ...others]
    .map(({ path, favorite }) => ({ path, ...(favorite ? { favorite: true } : {}) }));
  if (windowFolder && !ordered.some((entry) => entry.path === windowFolder)) {
    ordered.unshift({ path: windowFolder });
  }
  return ordered;
}

/** Validate a server `scope-changed` payload (the session was rebound by
 * `create_project`) into a LibraryScope. Only a folder rebind exists today;
 * anything malformed is ignored so a bad payload cannot corrupt the pill. */
export function scopeChangedScope(scope: unknown): LibraryScope | null {
  if (!scope || typeof scope !== 'object') return null;
  const value = scope as { kind?: unknown; path?: unknown };
  if (value.kind !== 'folder' || typeof value.path !== 'string' || !value.path.trim()) return null;
  return folderScope(value.path);
}

/** The query parameters a scope rides on — the WS connect URL and every
 * session-history request. Folder scope stays the legacy `folder` param;
 * the library scope is an explicit `scope=library`. */
export function scopeRequestParams(scope: LibraryScope): { folder?: string; scope?: 'library' } {
  return scope.kind === 'folder' ? { folder: scope.path } : { scope: 'library' };
}

/** Pill / header display name for a scope. The library scope is always
 * called "Library" in UI copy; a folder scope shows its `basename`
 * (path display helpers live in `lib/paths`). */
export function scopeDisplayName(scope: LibraryScope): string {
  return scope.kind === 'library' ? 'Library' : basename(scope.path);
}

export function scopePillAriaLabel(scope: LibraryScope, locked: boolean): string {
  const base = scope.kind === 'library'
    ? 'Session scope: Library'
    : `Session folder: ${basename(scope.path)}`;
  return locked ? `${base} — set for this conversation` : base;
}
