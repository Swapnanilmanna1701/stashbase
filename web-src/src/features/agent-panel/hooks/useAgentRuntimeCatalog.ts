import { useEffect } from 'react';
import { api, type Agent, type AgentsResponse } from '@/common/api/api';
import type { AgentKind, AgentMeta, AgentPanelCapabilities } from '@/common/lib/agentCatalog';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import type { Action, AppActions, ChatState } from '@/store/contexts/AppContext';
import { copyText } from '@/features/agent-panel/lib/agentSessionText';

/** Runtime discovery for one Chat tab: which descriptor backs this tab's
 *  Agent, whether it is usable yet, what it can do, and the two catalog
 *  writes (a plain refresh and the explicit check/bootstrap/login
 *  preparations) that change any of that. Read-only towards the session —
 *  nothing here touches the socket — so it composes ahead of
 *  `useAgentSession`'s connect effect, which gates on `runtimeBlocked` and
 *  calls `refreshRuntimes` from its event routing. */
export function useAgentRuntimeCatalog({
  agent,
  meta,
  agents,
  dispatch,
  actions,
}: {
  agent: AgentKind;
  meta: AgentMeta;
  agents: ChatState['agents'];
  dispatch: (a: Action) => void;
  actions: AppActions;
}) {
  const runtime: Agent | undefined = agents.find((candidate) => candidate.id === agent);
  const runtimeUnavailable = runtime?.state === 'unavailable';
  const bootstrapPhase = runtime?.bootstrap?.phase ?? 'idle';
  const bootstrapActive = bootstrapPhase === 'installing'
    || bootstrapPhase === 'authenticating'
    || bootstrapPhase === 'configuring';
  const bootstrapFailed = bootstrapPhase === 'failed';
  const runtimeBlocked = runtimeUnavailable || bootstrapActive || bootstrapFailed;
  const capabilities: AgentPanelCapabilities = runtime?.capabilities ?? meta.capabilities;
  // Mirrored for the once-bound WS handler chain (`turn-end` →
  // `runNextQueuedPrompt` → `mutateQueue`), which must not read the
  // connect-render's stale capabilities.
  const capabilitiesRef = useLatestRef(capabilities);

  /** Refresh after a failed or successful connection so the chrome reflects
   * the contract's in-memory available/failed state. */
  async function refreshRuntimes() {
    try {
      const result: AgentsResponse = await api.listAgents();
      dispatch({ type: 'AGENTS_LOADED', agents: result.clis });
    } catch {
      // Retain the last known catalog so an unavailable runtime remains
      // actionable even while the local server is restarting.
    }
  }

  /** Every explicit runtime preparation lands the same way: publish the
   *  returned catalog, or surface the failure as a toast. */
  async function applyRuntimeAction(request: () => Promise<AgentsResponse>) {
    try {
      const result = await request();
      dispatch({ type: 'AGENTS_LOADED', agents: result.clis });
    } catch (error) {
      actions.toast(error instanceof Error ? error.message : String(error), { level: 'error' });
    }
  }

  function startRuntimeBootstrap() {
    return applyRuntimeAction(() => api.prepareAgent(agent, 'bootstrap'));
  }

  function checkRuntime() {
    return applyRuntimeAction(() => api.prepareAgent(agent, 'check'));
  }

  function loginToCodex() {
    if (agent !== 'codex') return;
    return applyRuntimeAction(() => api.prepareAgent(agent, 'login'));
  }

  function copyInstallHint() {
    if (!runtime) return;
    void copyText(runtime.installHint).then((copied) => {
      actions.toast(copied ? 'Install command copied.' : 'Could not copy install command.', { level: copied ? 'info' : 'error' });
    });
  }

  // A chat can be opened before the app's initial discovery request
  // settles. Keep that tab out of the WebSocket path until its runtime has a
  // descriptor, so a missing CLI never briefly becomes a generic failure.
  useEffect(() => {
    if (!runtime) void refreshRuntimes();
  }, [runtime]);

  useEffect(() => {
    if (!bootstrapActive) return;
    const timer = window.setInterval(() => { void refreshRuntimes(); }, 500);
    return () => window.clearInterval(timer);
  }, [bootstrapActive]);

  return {
    runtime,
    runtimeUnavailable,
    bootstrapActive,
    bootstrapFailed,
    runtimeBlocked,
    capabilities,
    capabilitiesRef,
    refreshRuntimes,
    startRuntimeBootstrap,
    checkRuntime,
    loginToCodex,
    copyInstallHint,
  };
}
