/**
 * Owns the AI Index setup dialog. Mounted once at the app root, always —
 * not only when a folder is open — so it can resolve the app-wide
 * `embedderHasKey` fact even in a bare window, which is what lets the standing
 * Files-panel callout (and its "Set up" action) work before any folder opens.
 *
 * The dialog AUTO-OPENS whenever AI Index is neither authorized nor skipped
 * for the window's current context — including the bare window a fresh
 * launch boots into (J01: a fresh window does not resume a folder), so the
 * first open of a new window makes the offer without waiting for a folder.
 * Setting up a source is strongly recommended — an unindexed library has a
 * degraded Agent — but not forced: browsing, editing, preview, and keyword
 * search are local computations and stay available, so the dialog has a
 * deliberate, low-emphasis exit to "basic mode".
 *
 * Daily use is not tied to online auth (the check is a localhost call).
 * Activation persists (via the stored key) and clears only if the key is later
 * removed. The skip, by contrast, is per context within this window (see
 * `embeddingAuth`): a fresh window or a different folder offers indexing
 * again rather than staying silently opted out, while a bare-window skip
 * carries into the first folder opened so one launch is one offer; the skip
 * clears on activation, so removing a key re-gates cleanly.
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
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useAppActions, useWorkspace } from '@/store/contexts/AppContext';
import { useEmbedderState } from '@/common/hooks/useEmbedderState';
import { hasSkippedAiIndexing, isEmbeddingAuthorized, setAiIndexingSkipped } from '@/common/lib/embeddingAuth';
import { type EmbedderState } from '@/common/api/apiTypes';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { useOverlayLayer } from '@/common/components/OverlayStack';
import { ModalLoadingStatus } from '@/common/components/ui/status';
import { OPEN_EMBEDDING_SETUP_EVENT } from '@/common/lib/embeddingSetupTrigger';

const RequireApiKeyModal = lazyWithRetry(() =>
  import('@/features/settings/components/embedder/RequireApiKeyModal').then((mod) => ({ default: mod.RequireApiKeyModal })),
);

export function EmbedderRequireKeyGate() {
  const appState = useWorkspace();
  const { dispatch, actions } = useAppActions();
  const folder = appState.folder;
  const [open, setOpen] = useState(false);
  const layer = useOverlayLayer(open);
  // Fetch regardless of folder so `embedderHasKey` is an app-wide fact: the
  // Files-panel callout must be able to show (and its "Set up" must work)
  // even in a bare window with nothing open yet. embedderHasKey is part of
  // the key: removing the key in Settings must re-gate right away
  // ("removing a key later re-gates cleanly"), not wait for the next folder
  // switch.
  const onLoaded = useCallback((embedder: EmbedderState) => {
    dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: embedder.authorized });
    // Recommend, don't force. Auto-open in the bare window too — the first
    // open of a new window makes the offer without waiting for a folder.
    // The skip is per context within the window (see embeddingAuth), so a
    // different folder — or a fresh window — re-offers rather than staying
    // silently skipped.
    setOpen(!isEmbeddingAuthorized(embedder) && !hasSkippedAiIndexing(folder));
  }, [dispatch, folder]);
  const { embedder: state, patchEmbedder } = useEmbedderState({
    refreshKey: `${folder ?? ''}|${appState.embedderHasKey}`,
    onLoaded,
  });

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener(OPEN_EMBEDDING_SETUP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EMBEDDING_SETUP_EVENT, onOpen);
  }, []);

  if (!open) return null;

  return (
    <Suspense fallback={<ModalLoadingStatus label="Getting things ready…" isTopmost={layer.isTopmost} onCancel={() => { /* no casual dismiss while the dialog chunk loads */ }} />}>
      <RequireApiKeyModal
        initialProvider={state?.provider}
        isTopmost={layer.isTopmost}
        onSaved={(provider, model, backfillStarted, warning) => {
          patchEmbedder((s) => ({ ...s, provider, model, hasKey: true, authorized: true, source: provider }));
          dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
          // Activated: clear any prior basic-mode choice so a future key
          // removal re-gates from a clean state instead of staying skipped.
          setAiIndexingSkipped(false, folder);
          setOpen(false);
          if (warning) actions.toast(`API key saved, but validation could not reach the provider: ${warning}`, { level: 'warning' });
          if (backfillStarted) void actions.markVisibleFilesPendingForSearch();
          void actions.refreshIndexState();
        }}
        onSignedIn={(backfillStarted) => {
          patchEmbedder((s) => ({
            ...s,
            authorized: true,
            source: 'stashbase-account',
            account: { ...s.account, signedIn: true, active: true },
          }));
          dispatch({ type: 'EMBEDDER_KEY_STATE', hasKey: true });
          setAiIndexingSkipped(false, folder);
          setOpen(false);
          if (backfillStarted) void actions.markVisibleFilesPendingForSearch();
          void actions.refreshIndexState();
        }}
        onSkip={() => {
          // Deliberate opt-out to basic mode for THIS folder in this
          // window; another folder (or a relaunch) re-offers. The
          // Files-panel entry reopens it any time.
          setAiIndexingSkipped(true, folder);
          setOpen(false);
        }}
      />
    </Suspense>
  );
}
