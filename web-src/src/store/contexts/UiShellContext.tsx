/**
 * UI-shell slice: the cross-cutting overlay/blocking states — context menu,
 * inline rename, the rename-cascade prompt, the alert/confirm modal, and
 * in-document Find. Membership is `UiShellSlice` in `state.ts`, which also
 * records why `ctxMenu` and `renaming` (workspace/tree in origin) live here
 * rather than in `WorkspaceContext`.
 *
 * The slice is published verbatim; the ui-shell sub-reducer only returns a
 * new object for actions this slice owns.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { State, UiShellSlice } from '@/store/state/state';

export type UiShellState = UiShellSlice;

export const UiShellContext = createContext<UiShellState | null>(null);

export function UiShellProvider({ state, children }: { state: State; children: ReactNode }) {
  return <UiShellContext.Provider value={state.uiShell}>{children}</UiShellContext.Provider>;
}

export function useUiShell(): UiShellState {
  const ctx = useContext(UiShellContext);
  if (!ctx) throw new Error('useUiShell must be used inside <UiShellProvider>');
  return ctx;
}
