/**
 * The standing embedding-authorization affordance, in the Files panel.
 *
 * The dialog (`EmbedderRequireKeyGate`) offers setup on folder open while AI
 * indexing is neither on nor skipped; this line is what carries the offer
 * afterwards — for a user who chose basic mode and later wants to turn it on,
 * without going looking in Settings. It exists so setup is never reachable
 * only from Settings.
 *
 * It lives in the sidebar's bottom chrome, above the account row, because
 * authorization is app-wide. Inside the file tree it sat between a folder
 * header and that folder's own files, which read as a claim about those
 * files and pushed the tree down for a secondary notice.
 *
 * This line owns the "not set up" prompt outright: the account row below it
 * deliberately shows no index state and no sign-in call to action, so the
 * offer is made once per screen rather than twice in adjacent rows.
 *
 * No dismiss control: it is already one quiet line, it disappears the
 * moment embedding is authorized, and the dialog is the thing that can be
 * waved off. A dismiss here would only hide the calm route and leave the
 * interrupting one.
 */
import { useEffect, useState } from 'react';
import { api, type EmbedderState } from '../api';
import { openEmbeddingSetup } from './EmbedderRequireKeyGate';
import { isEmbeddingAuthorized } from './embedder/embeddingAuth';

export default function EmbeddingSetupCallout() {
  const [embedder, setEmbedder] = useState<EmbedderState | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getEmbedder()
      .then((state) => { if (!cancelled) setEmbedder(state); })
      .catch(() => { /* startup race with server boot — stay hidden */ });
    return () => { cancelled = true; };
  }, []);

  if (isEmbeddingAuthorized(embedder)) return null;
  if (!embedder) return null;

  return (
    // Bottom chrome, not a card: no fill and no border. A tinted band at
    // row width reads as grime on the sidebar's already-sunken surface —
    // the same failure the app bans for selection and hover rows — and the
    // notice does not need a surface to be found, because it is one line
    // above the account row with the only accent in the strip sitting on it.
    // Padding matches the account row so the two share a left edge.
    // `flex-none` because the sidebar is a flex column: without it a tall
    // tree squeezes this to nothing.
    <div className="mx-1.5 mb-1 flex flex-none items-center gap-2 px-2 py-1 text-xs leading-snug text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">AI Index isn’t enabled</span>
      <button
        type="button"
        className="flex-none cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent underline underline-offset-2"
        onClick={openEmbeddingSetup}
      >Set up</button>
    </div>
  );
}
