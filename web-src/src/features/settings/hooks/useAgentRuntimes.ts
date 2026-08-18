import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type Agent,
  type AgentRuntimeDebugState,
  type AgentsResponse,
} from '@/common/api/api';
import { AGENT_META, type AgentKind } from '@/common/lib/agentCatalog';
import { useAppActions } from '@/store/contexts/AppContext';

const DEFAULT_DEBUG: AgentRuntimeDebugState = {
  enabled: false,
  discoveryPolicy: 'auto',
  nextFailure: 'none',
  nextTurnFailure: 'none',
};

export interface AgentRuntimeStatus {
  tone: 'success' | 'error';
  text: string;
}

export interface AgentRuntimesController {
  agents: Agent[];
  debug: AgentRuntimeDebugState;
  /** `install:<kind>`, `uninstall:<kind>`, `reset:<kind>`, or `debug`. */
  busy: string | null;
  status: AgentRuntimeStatus | null;
  install: (agent: AgentKind) => Promise<void>;
  /** Start Codex's in-app browser sign-in. No-op for any other runtime. */
  login: (agent: AgentKind) => Promise<void>;
  uninstall: (agent: AgentKind) => Promise<void>;
  updateDebug: (patch: Partial<Omit<AgentRuntimeDebugState, 'enabled'>>) => Promise<void>;
  resetFirstRun: (agent: AgentKind) => Promise<void>;
}

/**
 * The Agents settings panel's runtime catalog and its four mutations.
 *
 * Every server response carries the whole catalog, so each command applies
 * it through one path that also republishes to the store — the panel is not
 * the only reader of agent availability, and a runtime that finished
 * installing has to reach the chat surfaces too.
 *
 * An install is asynchronous on the server side: while any agent reports an
 * `installing`, `authenticating`, or `configuring` phase the catalog re-reads on a short timer,
 * silently, so a failed background poll never overwrites the status line a
 * user's own action just produced.
 */
export function useAgentRuntimes(): AgentRuntimesController {
  const { actions, dispatch } = useAppActions();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [debug, setDebug] = useState<AgentRuntimeDebugState>(DEFAULT_DEBUG);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentRuntimeStatus | null>(null);
  const activeInstall = useMemo(
    () => agents.some((agent) => (
      agent.bootstrap?.phase === 'installing'
      || agent.bootstrap?.phase === 'authenticating'
      || agent.bootstrap?.phase === 'configuring'
    )),
    [agents],
  );

  const applyResponse = useCallback((response: AgentsResponse) => {
    setAgents(response.clis);
    setDebug(response.debug ?? DEFAULT_DEBUG);
    dispatch({ type: 'AGENTS_LOADED', agents: response.clis });
  }, [dispatch]);

  const fail = useCallback((error: unknown) => {
    setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
  }, []);

  const refresh = useCallback(async (silent = false) => {
    try {
      applyResponse(await api.listAgents());
    } catch (error) {
      if (!silent) fail(error);
    }
  }, [applyResponse, fail]);

  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => {
    if (!activeInstall) return;
    const timer = window.setInterval(() => { void refresh(true); }, 500);
    return () => window.clearInterval(timer);
  }, [activeInstall, refresh]);

  const install = useCallback(async (agent: AgentKind) => {
    setBusy(`install:${agent}`);
    setStatus(null);
    try {
      applyResponse(await api.prepareAgent(agent, 'bootstrap'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }, [applyResponse, fail]);

  const login = useCallback(async (agent: AgentKind) => {
    if (agent !== 'codex') return;
    setBusy(`login:${agent}`);
    setStatus(null);
    try {
      applyResponse(await api.prepareAgent(agent, 'login'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }, [applyResponse, fail]);

  const uninstall = useCallback(async (agent: AgentKind) => {
    const label = AGENT_META[agent].name;
    const confirmed = await actions.confirm(
      `Uninstall the StashBase-managed ${label} runtime to free disk space? Any active ${label} chat ends now. Your provider login and history are not affected; the next New Chat prepares the runtime again.`,
      { title: `Uninstall ${label} runtime?`, confirmLabel: 'Uninstall', destructive: true },
    );
    if (!confirmed) return;
    setBusy(`uninstall:${agent}`);
    setStatus(null);
    try {
      applyResponse(await api.resetManagedAgent(agent));
      setStatus({ tone: 'success', text: `${label} managed runtime removed.` });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }, [actions, applyResponse, fail]);

  const updateDebug = useCallback(async (patch: Partial<Omit<AgentRuntimeDebugState, 'enabled'>>) => {
    setBusy('debug');
    setStatus(null);
    try {
      applyResponse(await api.setAgentRuntimeDebug(patch));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }, [applyResponse, fail]);

  const resetFirstRun = useCallback(async (agent: AgentKind) => {
    const label = AGENT_META[agent].name;
    const confirmed = await actions.confirm(
      `Reset the StashBase-managed ${label} runtime? Your global installation and provider login are not changed.`,
      { title: `Reset ${label} runtime?`, confirmLabel: 'Reset', destructive: true },
    );
    if (!confirmed) return;
    setBusy(`reset:${agent}`);
    setStatus(null);
    try {
      applyResponse(await api.setAgentRuntimeDebug({ discoveryPolicy: 'managed-only' }));
      applyResponse(await api.resetManagedAgent(agent));
      setStatus({ tone: 'success', text: `${label} now simulates a first-time user. Click New Chat to test installation, then return discovery to Auto when finished.` });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }, [actions, applyResponse, fail]);

  return { agents, debug, busy, status, install, login, uninstall, updateDebug, resetFirstRun };
}
