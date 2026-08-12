/**
 * Whether AI Index is authorized, whether the user has deliberately opted
 * out of it, and the one place that decides both.
 *
 * Today the only way to authorize is a provider API key the user pasted in.
 * A signed-in account is meant to become a second way, and the point of
 * this module is that adding it is ONE edit here rather than an audit of
 * every `!hasKey` in the renderer — the dialog, the Files-panel line, the
 * settings panel, and the sidebar all ask this question, and they must
 * never disagree about the answer.
 */
import type { EmbedderState } from '../../api';

export function isEmbeddingAuthorized(state: EmbedderState | null | undefined): boolean {
  if (!state) return false;
  return state.hasKey;
}

/**
 * "Basic mode": the user was offered AI Index and declined for now.
 *
 * Deliberately session-scoped — held in memory for the life of THIS window,
 * not persisted — so opening a new window offers indexing again. The label
 * says "Skip for now", and this is what makes "for now" literal:
 * the skip quiets the prompt for the current window (folder switches inside it
 * do not re-nag) but never becomes a standing machine-wide opt-out. Browsing,
 * editing, preview, and keyword search all keep working meanwhile; the
 * Files-panel "Set up AI Index" entry is the calm route back.
 *
 * Cleared on successful activation, so removing the key later re-gates from a
 * clean state rather than silently staying skipped.
 */
let skippedThisWindow = false;

export function hasSkippedAiIndexing(): boolean {
  return skippedThisWindow;
}

export function setAiIndexingSkipped(skipped: boolean): void {
  skippedThisWindow = skipped;
}
