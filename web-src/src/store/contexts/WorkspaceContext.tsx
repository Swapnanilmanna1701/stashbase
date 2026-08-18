/**
 * Workspace slice: folder identity, the file tree, tabs, save/editor
 * registration, and folder-level indexing/preparation state. Membership is
 * `WorkspaceSlice` in `state.ts` — this file restates none of it.
 *
 * The provider publishes `state.workspace` plus the one derived field
 * (`activeTab`). The workspace sub-reducer rebuilds that slice only for
 * actions the slice owns, so a dispatch into chat or ui-shell leaves this
 * context's value identity alone and consumers here don't re-render for it.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getActiveTab, type State, type Tab, type WorkspaceSlice } from '@/store/state/state';

export type WorkspaceState = WorkspaceSlice & {
  /** Derived from `tabs` + `activeTabId` — see `getActiveTab`. */
  activeTab: Tab | null;
};

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ state, children }: { state: State; children: ReactNode }) {
  const workspace = state.workspace;
  const value = useMemo<WorkspaceState>(
    () => ({ ...workspace, activeTab: getActiveTab(workspace) }),
    [workspace],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
