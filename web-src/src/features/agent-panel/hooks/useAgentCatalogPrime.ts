import { useEffect } from 'react';
import { api } from '@/common/api/api';
import type { Action } from '@/store/contexts/AppContext';

/**
 * Prime the window's agent registry once, at the shell's always-mounted
 * home.
 *
 * Every chat surface is lazy or conditional, and each `AgentView` refreshes
 * the catalog after a connection outcome — but a window that never opens
 * chat still renders agent state (the New Chat button's runtime, Settings'
 * runtime list), so the first read cannot wait for a chat surface to mount.
 *
 * A failure is silent: the renderer falls back to the local agent defaults,
 * which is enough to draw the affordances and let a user start a chat that
 * then reports its own runtime problem.
 */
export function useAgentCatalogPrime(dispatch: (action: Action) => void): void {
  useEffect(() => {
    let cancelled = false;
    api.listAgents().then((r) => {
      if (!cancelled) dispatch({ type: 'AGENTS_LOADED', agents: r.clis });
    }).catch(() => { /* renderer falls back to local defaults */ });
    return () => { cancelled = true; };
  }, [dispatch]);
}
