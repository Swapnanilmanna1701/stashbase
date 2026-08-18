/** The `GET /api/index-status` response contract.
 *
 *  This is the folder-scoped status the sidebar, search banner, and preview
 *  banners poll. It is a superset of the indexer's own status
 *  (`IndexerStatus` in `server/indexer.ts`): the route re-derives the path
 *  lists as folder-relative visible paths and folds in embedding
 *  availability, conversion scheduling, and preparation failures.
 *
 *  Lives in `shared/` because both processes speak it: `buildIndexStatus`
 *  in `server/index-status.ts` produces it, and the renderer consumes it
 *  through `@/common/api`. Types only — no runtime, no Node imports.
 */
import type { ConversionProgress } from './conversion.ts';

/** Coarse embedding-readiness label the renderer renders directly. */
export type SemanticIndexingState =
  | 'disabled'
  | 'quota-exhausted'
  | 'partial-quota-exhausted'
  | 'awaiting-decision'
  | 'paused'
  | 'partial-paused'
  | 'indexing'
  | 'partial-indexing'
  | 'ready'
  | 'failed';

export interface SemanticIndexingStatus {
  state: SemanticIndexingState;
  /** Present only while a folder has a recorded decision (awaiting/paused);
   *  the two together size the "index N files" prompt. */
  sourceCount?: number;
  estimatedBytes?: number;
}

/** Non-null when the active folder's background index sync failed after
 *  opening/importing. Cleared by a successful manual/background sync or
 *  user dismissal. */
export interface IndexWarning {
  message: string;
  at: string;
}

/** Persistent file preparation failure record — subset of the on-disk
 *  entry, with timestamps the UI doesn't need stripped. */
export interface PreparationFailure {
  /** Folder-relative source path. */
  path: string;
  lastError: string;
  attempts: number;
  status: 'failed' | 'cancelled';
}

export interface IndexStatus {
  /** Absolute path of the folder this status describes. */
  folder: string;
  /** Files on disk that look indexable. */
  total: number;
  /** Files on disk that already have rows in the index. */
  indexed: number;
  /** UI-visible sources waiting to be embedded, as folder-relative display
   *  paths. Empty whenever semantic indexing is unavailable — unlike the
   *  indexer's own `pending`, which is absolute and unfiltered. */
  pending: string[];
  pendingCount: number;
  /** Index rows whose source is gone from disk, folder-relative. */
  orphaned: string[];
  orphanedCount: number;
  /** True iff the indexer sees no pending and no orphaned rows. Computed
   *  over the indexer's unfiltered lists, not the visible ones above. */
  upToDate: boolean;
  /** False when semantic indexing/retrieval is unconfigured, e.g. no
   *  embedding key. */
  semanticEnabled: boolean;
  /** False while a configured hosted source is blocked by its shared quota. */
  semanticAvailable: boolean;
  /** Human-readable reason, sent only when `semanticAvailable` is false. */
  semanticDisabledReason?: string;
  /** True when no UI-visible file is waiting for embedding. Unlike
   *  `upToDate`, this ignores orphaned/hidden index rows that are not
   *  relevant to search-readiness accounting. */
  visibleIndexingSettled: boolean;
  semanticIndexing: SemanticIndexingStatus;
  /** False until the folder has received at least one daemon status
   *  response. Optional because the indexer interface leaves it optional. */
  indexReady: boolean;
  /** Folder-relative paths of sources that are queued or running. */
  pendingConversions: string[];
  /** Incomplete convertible sources that cannot be queued until setup is
   *  resolved (currently audio with an unavailable runtime/provider/model). */
  blockedConversions: string[];
  /** Folder-relative conversion progress keyed by visible source path.
   *  Used by PDF/image preview banners for queue/extraction/indexing copy. */
  conversionProgress: Record<string, ConversionProgress>;
  /** Global in-memory scheduler change counter. Display-only notification;
   *  derived artifacts remain the conversion source of truth. */
  conversionRevision: number;
  /** Folder-relative per-source refresh tokens for derived previews. */
  conversionVersions: Record<string, number>;
  /** Persistent preparation failures. Survives app restart (read back from
   *  AppData `state.db`). Empty when no failures. Drives lightweight row
   *  markers, rich viewer banners, and the context-menu Reprocess entry. */
  preparationFailures: PreparationFailure[];
  /** Monotonic counter the server bumps on every external fs event
   *  (after self-write filtering). Renderer compares against its
   *  last-seen value and triggers `/api/files` on any change — picks
   *  up writes from the chat panel (Claude Code, `touch`, …) even
   *  for non-indexable files / empty dirs that don't move `pending`. */
  treeVersion: number;
  indexWarning: IndexWarning | null;
}

export type PdfStatusKind = 'in-flight' | 'done' | 'failed' | 'cancelled';

/** Full per-file preparation status from `GET /api/pdf/status`. Richer than
 *  `PreparationFailure`, which carries only what a failure banner needs. */
export interface PdfStatusEntry {
  status: PdfStatusKind;
  attempts: number;
  lastError?: string;
  lastAttemptAt: string;
  doneAt?: string;
}
