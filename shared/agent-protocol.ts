/**
 * The Agent panel's renderer ↔ server wire protocol.
 *
 * Both ends speak exactly this vocabulary over the panel's WebSocket: the
 * renderer sends `AgentClientEvent`, the server sends `AgentServerEvent`, and
 * `AgentModel` / `AgentSkill` are the two payload shapes those events carry.
 *
 * They live in `shared/` — beside `conversion.ts` and `transcription.ts` —
 * rather than in `server/agent-contract.ts` because the renderer must be able
 * to import them without reaching into `server/`. `agent-contract.ts` pulls in
 * `ws`, the CLI resolvers, and the runtime installer; a single non-type import
 * from the renderer would drag that whole graph into the browser bundle.
 * `server/agent-contract.ts` re-exports everything here, so server-side callers
 * keep importing it from one place.
 *
 * Runtime-specific lifecycle detail (adapters, capabilities, session scope)
 * stays in `server/agent-contract.ts`: it is server vocabulary, not wire
 * vocabulary.
 */

/** The adapter's classification of a turn-scoped runtime failure. Assigned
 * once, server-side, by `server/agent-turn-failure.ts`; the renderer switches
 * on the kind to offer the matching recovery and never parses message prose. */
export type AgentTurnFailureKind = 'rate-limit' | 'quota' | 'auth-expired' | 'network';

export interface AgentTurnFailure {
  kind: AgentTurnFailureKind;
}

/** A model is always advertised by the native runtime, never a StashBase list. */
export interface AgentModel {
  id: string;
  label: string;
  description?: string;
  supportedEfforts?: string[];
}
export interface AgentSkill { id: string; label: string; description?: string; argumentHint?: string }

/** The stable panel wire protocol. Adapters may translate native events,
 * but they must only emit this transcript and lifecycle vocabulary. */
export type AgentClientEvent =
  | { t: 'prompt'; text: string; titleHint?: string; skill?: string }
  | { t: 'refresh-skills' }
  | { t: 'steer'; id: string; text: string }
  | { t: 'permission-reply'; id: string; allow: boolean; always?: boolean }
  | { t: 'interrupt' }
  | { t: 'close' }
  | { t: 'set-mode'; mode: string };

export type AgentServerEvent =
  | { t: 'ready' }
  | { t: 'session-id'; id: string }
  | { t: 'session-title'; title: string }
  | { t: 'models'; models: AgentModel[]; activeModel?: string; fallback?: string }
  | { t: 'skills'; skills: AgentSkill[]; state: 'available' | 'empty' | 'failed'; error?: string }
  | { t: 'turn-start' }
  | { t: 'text'; delta: string }
  | { t: 'thinking'; delta: string }
  | { t: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { t: 'tool-delta'; id: string; delta: string }
  | { t: 'tool-result'; id: string; content: string; isError: boolean }
  | { t: 'permission'; id: string; toolUseId: string; name: string; title: string | null; input: Record<string, unknown> }
  | { t: 'steer-result'; id: string; ok: boolean; message?: string }
  /** The server migrated this session's scope binding (create_project
   * rebinding a library-scoped chat to the new project). The renderer
   * updates its connected scope and the owning window selects the folder. */
  | { t: 'scope-changed'; scope: { kind: 'folder'; path: string } }
  | { t: 'turn-end'; isError: boolean }
  /** `failure` is present only when the adapter classified the message into
   * a turn-failure kind; unclassified errors keep the bare shape. */
  | { t: 'error'; message: string; failure?: AgentTurnFailure }
  | { t: 'exit'; message?: string };
