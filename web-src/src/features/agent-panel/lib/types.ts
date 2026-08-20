export type PermMode = 'default' | 'acceptEdits' | 'plan' | 'auto';

/** Opaque reasoning-effort identifier advertised by the active runtime. */
export type EffortLevel = string;

export type ToolStatus = 'running' | 'awaiting' | 'done' | 'error' | 'denied';

/** A context file attached to the composer. Image uploads use a renderer-local
 * object URL while composing; restored sessions use a constrained local
 * preview URL. The agent only receives `path`, never either preview URL. */
export interface Attachment { path: string; name: string; dims?: string; previewUrl?: string }

export interface ToolBlock {
  kind: 'tool';
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  /** Set while a permission prompt for this tool is pending. */
  permId?: string;
  permTitle?: string | null;
  result?: string;
}

export type Block =
  | { kind: 'user'; id: string; text: string; attachments?: Attachment[] }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  /** Non-fatal runtime guidance. It remains transcript evidence without
   * entering the session or turn failure state machines. */
  | { kind: 'notice'; id: string; text: string }
  /** `failureKind` is the adapter's classification of a live turn failure;
   * replayed history renders the same error without it (plain message). */
  | { kind: 'error'; id: string; text: string; failureKind?: AgentTurnFailureKind }
  | ToolBlock;

export type ServerEvent = AgentServerEvent;

export type AgentKind = 'claude' | 'codex';
export type { AgentModel, AgentSkill, AgentTurnFailureKind } from '@shared/agent-protocol';
import type { AgentServerEvent, AgentTurnFailureKind } from '@shared/agent-protocol';
