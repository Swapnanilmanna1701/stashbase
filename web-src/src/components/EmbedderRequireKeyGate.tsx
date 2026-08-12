/**
 * Owns the AI Index setup dialog. Mounted once at the app root, always —
 * not only when a folder is open — so it can resolve the app-wide
 * `embedderHasKey` fact even in a bare window, which is what lets the standing
 * Files-panel callout (and its "Set up" action) work before any folder opens.
 *
 * The dialog AUTO-OPENS only while a folder is open and AI Index is neither
 * authorized nor skipped — it is a folder-context prompt. Setting up a source
 * is strongly recommended — an unindexed library has a degraded Agent — but
 * not forced: browsing, editing, preview, and keyword search are local
 * computations and stay available, so the dialog has a deliberate,
 * low-emphasis exit to "basic mode".
 *
 * Daily use is not tied to online auth (the check is a localhost call).
 * Activation persists (via the stored key) and clears only if the key is later
 * removed. The skip, by contrast, is per-window (see `embeddingAuth`): a fresh
 * window offers indexing again rather than staying silently opted out. Within
 * a window the skip clears on activation, so removing a key re-gates cleanly.
 *
 * The gate owns the dialog rather than the card, because the post-save work
 * is app-level: reducer state, the validation-warning toast, marking visible
 * files pending, and refreshing index state.
 *
 * Exits:
 *   • Save key — activates; dialog closes.
 *   • Skip for now — records basic mode; dialog closes. The
 *     Files-panel "Set up AI Index" entry (and Settings) reopen it later.
 */
import { Suspense, useEffect, useState } from 'react';
import { api, type EmbedderState } from '../api';
import { useApp } from '../store/AppContext';
import { hasSkippedAiIndexing, isEmbeddingAuthorized, setAiIndexingSkipped } from './embedder/embeddingAuth';
import { lazyWithRetry } from './ErrorBoundary';
import { useOverlayLayer } from './OverlayStack';
import { ModalLoadingStatus } from './ui/status';

const RequireApiKeyModal = lazyWithRetry(() =>
  import('./embedder/RequireApiKeyModal').then((mod) => ({ default: mod.RequireApiKeyModal })),
);

const OPEN_EVENT = 'stashbase-open-embedding-setup';

/** Open the setup dialog from anywhere — the Files-panel "Set up AI Index"
 *  entry, or Settings. Mirrors `openSettings`; the alternative is threading a
 *  callback from the app root down to a lazily-loaded card. */
export function openEmbeddingSetup(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function EmbedderRequireKeyGate() {
  const { state: appState, dispatch, actions } = useApp();
  const folder = appState.folder;
  const [state, setState] = useState<EmbedderState | null>(null);
  const [open, setOpen] = useState(false);
  const layer = useOverlayLayer(open);

  useEffect(() => {
    let cancelled = false;
    // Fetch regardless of folder so `embedderHasKey` is an app-wide fact: the
    // Files-panel callout must be able to show (and its "Set up" must work)
    // even in a bare window with nothing open yet.
    api.getEmbedder()
      .then((embedder) => {
        if (cancelled) return;
        setState(embedder);
        dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: embedder.hasKey });
        // Recommend, don't force. Auto-open only with a folder open — the
        // dialog is a folder-context prompt; without one the standing callout
        // carries the offer. The skip is per-window (see embeddingAuth), so a
        // fresh window re-offers rather than staying silently skipped.
        setOpen(!!folder && !isEmbeddingAuthorized(embedder) && !hasSkippedAiIndexing());
      })
      .catch(() => { /* startup race with server boot — silent */ });
    return () => { cancelled = true; };
  }, [folder]);

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  if (!open) return null;

  return (
    <Suspense fallback={<ModalLoadingStatus label="Getting things ready…" isTopmost={layer.isTopmost} onCancel={() => { /* no casual dismiss while the dialog chunk loads */ }} />}>
      <RequireApiKeyModal
        initialProvider={state?.provider}
        isTopmost={layer.isTopmost}
        onSaved={(provider, model, backfillStarted, warning) => {
          setState((s) => (s ? { ...s, provider, model, hasKey: true } : s));
          dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
          // Activated: clear any prior basic-mode choice so a future key
          // removal re-gates from a clean state instead of staying skipped.
          setAiIndexingSkipped(false);
          setOpen(false);
          if (warning) actions.toast(`API key saved, but validation could not reach the provider: ${warning}`, { level: 'warning' });
          if (backfillStarted) void actions.markVisibleFilesPendingForSearch();
          void actions.refreshIndexState();
        }}
        onSkip={() => {
          // Deliberate opt-out to basic mode; remembered so it does not
          // reappear every launch. The Files-panel entry reopens it.
          setAiIndexingSkipped(true);
          setOpen(false);
        }}
      />
    </Suspense>
  );
}
