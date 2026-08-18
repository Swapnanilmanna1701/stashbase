import type { Block } from '@/features/agent-panel/lib/types';

export interface AgentTerminalState {
  blocks: Block[];
  queuedTurns: [];
  turnActive: false;
  phase: 'closed';
  fatal: string | null;
  recoveryLabel: 'Retry' | 'Reconnect';
}

/** The renderer's single terminal transition for both protocol exits and raw
 * socket closure. It deliberately never appends a transcript error block:
 * the fatal card/inline state owns the cause exactly once. */
export function terminalAgentState({
  blocks,
  ready,
  exitReceived,
  agentShortName,
  message,
  currentFatal,
}: {
  blocks: Block[];
  ready: boolean;
  exitReceived: boolean;
  agentShortName: string;
  message?: string;
  currentFatal: string | null;
}): AgentTerminalState {
  const fatal = message
    ?? currentFatal
    ?? (!ready
      ? `Connection closed before ${agentShortName} started.`
      : !exitReceived
        ? `${agentShortName} disconnected unexpectedly.`
        : null);
  return {
    blocks: blocks.map((block) =>
      block.kind === 'tool' && (block.status === 'running' || block.status === 'awaiting')
        ? { ...block, status: 'error' }
        : block),
    queuedTurns: [],
    turnActive: false,
    phase: 'closed',
    fatal,
    recoveryLabel: ready && fatal ? 'Reconnect' : 'Retry',
  };
}

export interface ClosableAgentSocket {
  onclose: ((...args: any[]) => unknown) | null;
  readyState: number;
  send(value: string): void;
  close(): void;
}

/** Explicit renderer teardown is expected and must not enter the terminal
 * transition through the socket's close callback. */
export function closeAgentSocketIntentionally(ws: ClosableAgentSocket): void {
  ws.onclose = null;
  // Chromium reports send() on CLOSING/CLOSED as a console error even when
  // the exception is caught. Only an OPEN socket can accept the courtesy
  // close frame; close() below remains the authoritative teardown.
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify({ t: 'close' })); } catch { /* already gone */ }
  }
  ws.close();
}
