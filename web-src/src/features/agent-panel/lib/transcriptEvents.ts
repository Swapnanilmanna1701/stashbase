/**
 * The transcript half of the agent protocol as pure `Block[] -> Block[]`
 * steps.
 *
 * `useAgentSession.handleEvent` stays a dispatcher: the lifecycle cases
 * (ready, session-id, error, exit, scope-changed) keep their side effects
 * there because they feed the connection state machine, while every rule
 * that only rewrites the visible transcript lives here. That keeps the
 * tool/permission rules — which carry the protocol's real edge cases —
 * testable without a socket, a session, or React.
 */
import type { AgentServerEvent } from '@shared/agent-protocol';
import type { Block, ToolBlock } from '@/features/agent-panel/lib/types';

type ServerEventOf<T extends AgentServerEvent['t']> = Extract<AgentServerEvent, { t: T }>;

/** A tool call started: append its card in the running state. */
export function openToolCard(blocks: Block[], ev: ServerEventOf<'tool'>): Block[] {
  return [...blocks, { kind: 'tool', id: ev.id, name: ev.name, input: ev.input, status: 'running' }];
}

/** Streamed tool output. A denied card is frozen — the user already
 *  rejected it, so late output must not reopen or repaint it. */
export function appendToolOutput(blocks: Block[], ev: ServerEventOf<'tool-delta'>): Block[] {
  return blocks.map((block) => (
    block.kind === 'tool' && block.id === ev.id && block.status !== 'denied'
      ? { ...block, result: (block.result ?? '') + ev.delta }
      : block));
}

/** Final tool output, which also settles the card's status. Denied cards
 *  stay denied for the same reason as above. */
export function completeToolCard(blocks: Block[], ev: ServerEventOf<'tool-result'>): Block[] {
  return blocks.map((block) => (
    block.kind === 'tool' && block.id === ev.id && block.status !== 'denied'
      ? { ...block, status: ev.isError ? 'error' : 'done', result: ev.content }
      : block));
}

/** A permission prompt for a tool call: attach it to that call's card. */
export function markToolAwaitingPermission(blocks: Block[], ev: ServerEventOf<'permission'>): Block[] {
  const idx = blocks.findIndex((block) => block.kind === 'tool' && block.id === ev.toolUseId);
  if (idx >= 0) {
    const next = blocks.slice();
    next[idx] = { ...(next[idx] as ToolBlock), status: 'awaiting', permId: ev.id, permTitle: ev.title };
    return next;
  }
  // Race fallback: permission arrived before the tool card.
  return [...blocks, { kind: 'tool', id: ev.toolUseId, name: ev.name, input: ev.input, status: 'awaiting', permId: ev.id, permTitle: ev.title }];
}

/** A completed turn cannot retain an in-flight tool. Codex normally emits
 *  `item/completed` for every tool, but an omitted or unmatched notification
 *  must not leave the transcript permanently "Running". */
export function settleRunningTools(blocks: Block[], isError: boolean): Block[] {
  return blocks.map((block) => (
    block.kind === 'tool' && block.status === 'running'
      ? { ...block, status: isError ? 'error' : 'done' }
      : block));
}

/** The user's answer to a permission prompt. Allowing resumes the running
 *  card; denying freezes it. Either way the prompt itself is consumed. */
export function applyPermissionReply(blocks: Block[], toolBlockId: string, allow: boolean): Block[] {
  return blocks.map((block) => (
    block.kind === 'tool' && block.id === toolBlockId
      ? { ...block, status: allow ? 'running' : 'denied', permId: undefined }
      : block));
}
