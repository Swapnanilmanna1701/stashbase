/**
 * Imperative handles a rendered document view registers with the store so the
 * action hooks can drive it. They are passed through actions but never stored
 * in `State` (a live DOM-bound object is not serializable state), which is why
 * they sit beside `state.ts` rather than in it. No action types live here — the
 * whole `Action` union is in `state.ts`.
 */

/** Imperative handle a Markdown document registers so save, rename, and file
 * switches can pull the live serialized Markdown. */
export interface EditorHandle {
  getValue: () => string;
  focus: () => void;
}

export interface MatchInfo {
  current: number;
  total: number;
}

export interface FindOptions {
  wholeWord: boolean;
  caseSensitive: boolean;
}

/** Per-view find driver registered by the currently rendered document view. */
export interface FindController {
  setQuery: (query: string, opts: FindOptions) => MatchInfo | Promise<MatchInfo>;
  /** Reapply an already-open query without moving a restored selection. */
  restoreQuery?: (query: string, opts: FindOptions) => MatchInfo | Promise<MatchInfo>;
  next: () => MatchInfo | Promise<MatchInfo>;
  prev: () => MatchInfo | Promise<MatchInfo>;
  close: () => void;
}
