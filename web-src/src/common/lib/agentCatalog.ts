/** Lives in `common/` because `store/contexts/ActionsContext.tsx` needs it and
 * `store/` may not import a feature — not because it is feature-agnostic.
 * Every other consumer is in `features/agent-panel/`. Do not "tidy" it down
 * into that feature; see "Where shared code goes" in
 * `code-review/renderer-architecture.md`. */
import type { ComponentType } from 'react';
import { ClaudeIcon, CodexIcon } from '@/common/components/icons';

export type AgentKind = 'claude' | 'codex';

/** Bootstrap contract used until the server has returned live runtime
 * discovery. The server descriptor takes precedence once available. */
export interface AgentPanelCapabilities {
  connection: true;
  prompts: true;
  interrupt: true;
  transcript: true;
  approvals: true;
  history: true;
  modes: boolean;
  effort: boolean;
  models: boolean;
  skills: boolean;
  steering: boolean;
  titleHint: boolean;
}

export interface AgentMeta {
  id: AgentKind;
  name: string;
  shortName: string;
  launcherLabel: string;
  capabilities: AgentPanelCapabilities;
  controlsNote: string;
  Icon: ComponentType<{ className?: string }>;
}

export const AGENT_META: Record<AgentKind, AgentMeta> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    shortName: 'Claude',
    launcherLabel: 'Claude Code',
    capabilities: { connection: true, prompts: true, interrupt: true, transcript: true, approvals: true, history: true, modes: true, effort: true, models: true, skills: true, steering: false, titleHint: false },
    controlsNote: 'Access applies live · Effort on new session',
    Icon: ClaudeIcon,
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    shortName: 'Codex',
    launcherLabel: 'Codex',
    capabilities: { connection: true, prompts: true, interrupt: true, transcript: true, approvals: true, history: true, modes: true, effort: true, models: true, skills: true, steering: true, titleHint: true },
    controlsNote: 'Access and effort apply on new session',
    Icon: CodexIcon,
  },
};

export const AGENTS: AgentMeta[] = [AGENT_META.claude, AGENT_META.codex];

export function isAgentKind(value: string): value is AgentKind {
  return value === 'claude' || value === 'codex';
}

export function agentMeta(value: string): AgentMeta {
  return isAgentKind(value) ? AGENT_META[value] : AGENT_META.claude;
}
