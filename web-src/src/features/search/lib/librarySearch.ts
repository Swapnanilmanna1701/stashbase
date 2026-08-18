/**
 * Pure logic for the library search popup: scope model, cross-open memory,
 * and absolute→(folder, relative) result-path mapping.
 *
 * The popup remembers its last query and results across close/reopen AND
 * across folder switches, so none of this state may live in the reducer —
 * both `folderScopedResetActions` and the `FILES_LOADED` folder-change
 * branch wipe folder-scoped fields on every switch. Module-scope memory is
 * the same deliberate choice as the command palette's recent-command list.
 */
import type { LibraryKeywordFile, LibraryKeywordSearchResult, SearchHit } from '@/common/api/api';
import type { LibraryScope } from '@/common/lib/libraryScope';
import type { LibrarySearchMode, LibrarySearchPrefill } from '@/common/lib/librarySearchTrigger';

/** The whole library, or one library folder by absolute path — the SAME
 *  model the chat composer binds a session to, so both surfaces share one
 *  scope picker (`ScopeMenu`) and one mental model. A folder scope names
 *  its folder outright, so it survives a window folder switch unchanged. */
export type LibrarySearchScope = LibraryScope;

export interface LibrarySemanticHit extends SearchHit {
  /** Absolute member folder root the hit lives in. */
  folder: string;
  /** Folder-relative source path — the identity the app opens. */
  rel: string;
}

export interface LibrarySearchResults {
  semanticHits: LibrarySemanticHit[] | null;
  keywordResult: LibraryKeywordSearchResult | null;
  error: string | null;
}

export interface LibrarySearchMemory extends LibrarySearchResults {
  query: string;
  mode: LibrarySearchMode;
  scope: LibrarySearchScope;
}

const defaultMemory: LibrarySearchMemory = {
  query: '',
  mode: 'semantic',
  scope: { kind: 'library' },
  semanticHits: null,
  keywordResult: null,
  error: null,
};

let memory: LibrarySearchMemory = defaultMemory;

export function readLibrarySearchMemory(): LibrarySearchMemory {
  return memory;
}

export function writeLibrarySearchMemory(patch: Partial<LibrarySearchMemory>): LibrarySearchMemory {
  memory = { ...memory, ...patch };
  return memory;
}

/** Merge an open-request prefill (FindBar's "search all files" handoff) into
 *  remembered state. A new query invalidates the remembered results. */
export function applyLibrarySearchPrefill(
  base: LibrarySearchMemory,
  prefill: LibrarySearchPrefill | null | undefined,
): LibrarySearchMemory {
  if (!prefill) return base;
  return {
    ...base,
    ...(prefill.query !== undefined
      ? { query: prefill.query, semanticHits: null, keywordResult: null, error: null }
      : {}),
    ...(prefill.mode !== undefined ? { mode: prefill.mode } : {}),
    ...(prefill.scope !== undefined ? { scope: prefill.scope } : {}),
  };
}

/** Test seam. */
export function resetLibrarySearchMemory(): void {
  memory = defaultMemory;
}

/** Same normalization contract as `folderRefsEqual`: fold separators, strip
 *  trailing slashes, case-fold only Windows drive/UNC paths. Lowercasing
 *  preserves length, so a prefix index into the folded key is also a valid
 *  index into the unfolded path. */
function pathKey(value: string): { key: string; windows: boolean } {
  let key = value.trim().replace(/\\/g, '/');
  const windows = /^[A-Za-z]:\//.test(key) || key.startsWith('//');
  if (key.length > 1 && key.endsWith('/')) key = key.replace(/\/+$/, '');
  return { key: windows ? key.toLowerCase() : key, windows };
}

/** Map an absolute library path onto the member folder that contains it.
 *  Longest root wins so nested member folders resolve to the deepest one.
 *  Returns null when the path is outside every known folder (stale hit
 *  after a library change — the caller drops it). */
export function splitLibraryPath(
  absPath: string,
  folderRoots: readonly string[],
): { folder: string; rel: string } | null {
  const target = pathKey(absPath);
  let best: { folder: string; rel: string; rootLength: number } | null = null;
  for (const root of folderRoots) {
    const candidate = pathKey(root);
    if (candidate.windows !== target.windows) continue;
    if (!target.key.startsWith(candidate.key + '/')) continue;
    if (best && candidate.key.length <= best.rootLength) continue;
    const normalized = absPath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    best = {
      folder: root,
      rel: normalized.slice(candidate.key.length + 1),
      rootLength: candidate.key.length,
    };
  }
  return best ? { folder: best.folder, rel: best.rel } : null;
}

/** Attach (folder, rel) identities to raw absolute-path semantic hits,
 *  dropping any hit the current member list cannot place. */
export function resolveSemanticHits(
  hits: readonly SearchHit[],
  folderRoots: readonly string[],
): LibrarySemanticHit[] {
  const out: LibrarySemanticHit[] = [];
  for (const hit of hits) {
    const split = splitLibraryPath(hit.fileName, folderRoots);
    if (split) out.push({ ...hit, folder: split.folder, rel: split.rel });
  }
  return out;
}

/** Stable ordering for keyword file groups: the active folder's files first
 *  (they are the likeliest target), other folders keep the server's member
 *  order. */
export function orderKeywordFiles(
  files: readonly LibraryKeywordFile[],
  activeFolderPath: string,
): LibraryKeywordFile[] {
  if (!activeFolderPath) return [...files];
  const active: LibraryKeywordFile[] = [];
  const rest: LibraryKeywordFile[] = [];
  for (const file of files) {
    (pathKey(file.folder).key === pathKey(activeFolderPath).key ? active : rest).push(file);
  }
  return [...active, ...rest];
}

export function folderBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

