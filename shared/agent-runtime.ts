/**
 * Agent runtime discovery and bootstrap vocabulary, shared by the server
 * that performs a bootstrap and the renderer that reports its progress.
 *
 * Every field here reaches the user as chrome: a phase drives the Agents
 * panel's button, and a failure decides whether that button offers a retry
 * or a manual recovery route. Both processes therefore have to agree on the
 * exact spelling of each state, which is what makes this a contract rather
 * than an implementation detail of either side.
 */

export type AgentBootstrapPhase = 'idle' | 'installing' | 'authenticating' | 'configuring' | 'ready' | 'failed';

export type AgentBootstrapFailureStage = 'discovery' | 'installation' | 'authentication' | 'mcp';

export type AgentBootstrapFailureCode =
  | 'simulated'
  | 'operation-failed'
  | 'runtime-unavailable'
  | 'authentication-required'
  | 'authentication-check-failed';

export type AgentBootstrapManualRecovery = 'install-command' | 'mcp-settings';

export interface AgentBootstrapFailure {
  stage: AgentBootstrapFailureStage;
  code: AgentBootstrapFailureCode;
  message: string;
  retryable: boolean;
  manualRecovery?: AgentBootstrapManualRecovery;
}

export interface AgentBootstrapStatus {
  phase: AgentBootstrapPhase;
  progress?: number;
  message?: string;
  failure?: AgentBootstrapFailure;
}

export type AgentDiscoveryPolicy = 'auto' | 'managed-only' | 'system-only';

export type AgentSetupFailureSimulation = 'none' | 'installation' | 'authentication' | 'mcp';

export type AgentTurnFailureSimulation =
  | 'none'
  | 'rate-limit'
  | 'quota'
  | 'auth-expired'
  | 'network'
  | 'crash';

export interface AgentRuntimeDebugState {
  enabled: boolean;
  discoveryPolicy: AgentDiscoveryPolicy;
  /** Development-only, mutually exclusive failure for the next matching
   * readiness stage. A consumed failure resets this field to `none`. */
  nextFailure: AgentSetupFailureSimulation;
  /** Development-only failure for the next prompt in any live Agent session.
   * One-shot like `nextFailure`; independent of the setup simulation. */
  nextTurnFailure: AgentTurnFailureSimulation;
}

export interface Agent {
  id: string;
  label: string;
  vendor: string;
  installHint: string;
  installed: boolean;
  /** Which executable discovery selected. `managed` lives under StashBase
   * AppData; `system` is an existing user installation. */
  source?: 'system' | 'managed' | null;
  bootstrap?: AgentBootstrapStatus;
  /** Full shell command the panel feeds to the shell once it's ready
   *  (e.g. `claude --theme light`). Built by the server from the agent
   *  registry so the renderer doesn't have to track per-agent flags. */
  launchCommand: string;
  /** Shared Agent Contract endpoint. Both current adapters use this common
   * bridge; `id` selects the native runtime. */
  endpoint?: string;
  state?: 'available' | 'unavailable' | 'failed';
  error?: string;
  capabilities?: {
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
  };
}

export interface AgentsResponse {
  clis: Agent[];
  debug?: AgentRuntimeDebugState;
}
