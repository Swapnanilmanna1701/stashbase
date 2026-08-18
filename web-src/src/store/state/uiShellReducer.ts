/**
 * UI-shell sub-reducer: the cross-cutting overlay/blocking states — context
 * menu, inline rename, the rename-cascade prompt, the alert/confirm modal,
 * and in-document Find. Composed with the workspace and chat sub-reducers by
 * `stateReducer.ts`; an action this slice does not own answers `undefined`.
 */
import type { Action, UiShellSlice } from './state';

export function uiShellReducer(u: UiShellSlice, a: Action): UiShellSlice | undefined {
  switch (a.type) {
    case 'CTX_MENU':
      return { ...u, ctxMenu: a.menu };
    case 'RENAMING':
      return { ...u, renaming: a.renaming };
    case 'CASCADE_PROMPT':
      return { ...u, cascadePrompt: a.prompt };
    case 'MODAL_OPEN':
      return { ...u, modal: a.request };
    case 'MODAL_CLOSE':
      return { ...u, modal: null };
    case 'FIND_OPEN':
      // Re-opening is a no-op on state but lets the bar's effect re-run
      // (e.g. user pressed Cmd+F again to refocus the input).
      return u.find.open ? u : { ...u, find: { ...u.find, open: true } };
    case 'FIND_CLOSE':
      // Keep `query` / `wholeWord` so reopening pre-fills the last term
      // (Chrome behavior). `current`/`total` zero out — they're stale
      // the moment the active controller drops its decorations.
      return { ...u, find: { ...u.find, open: false, current: 0, total: 0 } };
    case 'FIND_SET':
      return { ...u, find: { ...u.find, ...a.patch } };
    default:
      // Not this slice's action — see the composition note in `stateReducer.ts`.
      return undefined;
  }
}
