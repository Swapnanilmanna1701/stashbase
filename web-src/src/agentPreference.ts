import { isAgentKind, type AgentKind } from './agentCatalog';

const AGENT_PREFERENCE_KEY = 'stashbase.preferred-agent';
export const DEFAULT_AGENT: AgentKind = 'codex';

interface AgentPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): AgentPreferenceStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Invalid, missing, or inaccessible UI preference state always recovers to
 * Codex. Runtime availability remains a separate setup concern. */
export function readPreferredAgent(
  storage: AgentPreferenceStorage | undefined = browserStorage(),
): AgentKind {
  try {
    const stored = storage?.getItem(AGENT_PREFERENCE_KEY);
    return stored && isAgentKind(stored) ? stored : DEFAULT_AGENT;
  } catch {
    return DEFAULT_AGENT;
  }
}

/** Agent choice is an app-wide presentation preference, not folder or session
 * state. Storage failures must never block opening a chat. */
export function rememberPreferredAgent(
  agent: AgentKind,
  storage: AgentPreferenceStorage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(AGENT_PREFERENCE_KEY, agent);
  } catch {
    // Private browsing and hardened WebViews may reject localStorage.
  }
}

/** Describe the sidebar agent picker's effect. Kept separate from the React
 * event handler so picker selection and chat creation cannot drift together
 * without a focused regression test noticing. */
export function newChatAgentSelectionPlan(agent: AgentKind): {
  preferredAgent: AgentKind;
  startAgent: AgentKind | null;
} {
  return { preferredAgent: agent, startAgent: null };
}
