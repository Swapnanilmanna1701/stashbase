/**
 * The result of reconciling a folder against disk.
 *
 * Every list is present even when empty — the renderer distinguishes "no
 * changes" from "sync did not run" by whether it got a result at all, not by
 * a missing key. `cancelled` means the caller abandoned the run because its
 * folder or window stopped being current, so the lists hold partial work
 * rather than a complete picture.
 */
export interface SyncResult {
  added: string[];
  modified: string[];
  removed: string[];
  /** Files the daemon's scan_diff matched by content hash to a
   *  previously-indexed (now-deleted) path. Each entry is the NEW
   *  folder-relative path. Routed through `indexer.renameFile`, which the
   *  daemon fast-paths to reuse cached embeddings — no embedding tokens
   *  spent for these. */
  renamed: string[];
  failed: { name: string; error: string }[];
  /** True when the caller deliberately abandoned the sync because the
   *  target folder/window is no longer current. Any arrays are partial work
   *  completed before cancellation was observed. */
  cancelled?: boolean;
  /** Embedding was intentionally stopped by the folder's preflight state. */
  semanticPaused?: boolean;
}
