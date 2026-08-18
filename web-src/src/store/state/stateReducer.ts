/**
 * Pure renderer reducer. State and action definitions remain in the stable
 * state.ts facade; transition helpers live in stateHelpers.ts.
 *
 * One reducer from the caller's side, three underneath: each sub-reducer owns
 * exactly one slice of `State` and sees EVERY action, so an action that
 * legitimately spans slices (a folder change that resets both the workspace
 * and its chat tabs, say) is expressed once per slice rather than duplicated
 * into a coordinating branch here.
 *
 * A sub-reducer answers `undefined` for an action it does not own. Three
 * switches cannot each be exhaustive over `Action` the way the single
 * pre-split switch was, so that sentinel is what replaces the lost
 * compile-time check: an action NO slice claims produces `undefined` instead
 * of silently no-opping, which is both how an out-of-union action behaved
 * before (`__tests__/shared-overlays.test.ts` pins it) and the loud failure a
 * real action dropped from all three sub-reducers deserves.
 *
 * Returning `s` itself when every slice comes back unchanged keeps a no-op
 * dispatch a true no-op: `useReducer` bails out of the re-render, and the
 * reducer stays safe to call speculatively.
 */
import type { Action, State } from './state';
import { chatReducer } from './chatReducer';
import { uiShellReducer } from './uiShellReducer';
import { workspaceReducer } from './workspaceReducer';

export function reducer(s: State, a: Action): State {
  const workspace = workspaceReducer(s.workspace, a);
  const chat = chatReducer(s.chat, a);
  const uiShell = uiShellReducer(s.uiShell, a);
  if (workspace === undefined && chat === undefined && uiShell === undefined) {
    return undefined as unknown as State;
  }
  if (
    (workspace ?? s.workspace) === s.workspace
    && (chat ?? s.chat) === s.chat
    && (uiShell ?? s.uiShell) === s.uiShell
  ) {
    return s;
  }
  return {
    workspace: workspace ?? s.workspace,
    chat: chat ?? s.chat,
    uiShell: uiShell ?? s.uiShell,
  };
}
