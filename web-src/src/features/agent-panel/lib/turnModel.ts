/**
 * Pure turn model for the transcript: how a flat block stream becomes
 * turns, which part of a settled turn is "the answer" versus "the work",
 * whether the stream's tail already narrates itself, and the strings a
 * finished turn is labelled with. Rendering lives in AgentMessages.
 */
import type { Block } from '@/features/agent-panel/lib/types';

/** Per-turn "Worked for X" data, produced by AgentView and keyed by the
 * turn's user-message id. Absent for resumed history (no timing on the wire). */
export interface TurnMeta {
  /** Wall-clock ms the turn spent working, measured in the renderer. */
  durationMs: number;
  /** The user stopped this turn before it finished. */
  interrupted: boolean;
}

export interface Turn { key: string; head: Extract<Block, { kind: 'user' }> | null; body: Block[] }

export function groupTurns(blocks: Block[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  for (const b of blocks) {
    if (b.kind === 'user') {
      cur = { key: b.id, head: b, body: [] };
      turns.push(cur);
    } else {
      if (!cur) { cur = { key: `lead-${b.id}`, head: null, body: [] }; turns.push(cur); }
      cur.body.push(b);
    }
  }
  return turns;
}

/** True when the stream's last block already carries its own live status
 *  (see the generic tail's comment in MessageList). */
export function tailBlockSpeaks(blocks: Block[]): boolean {
  const tail = blocks[blocks.length - 1];
  if (!tail) return false;
  if (tail.kind === 'thinking') return true;
  // A tail tool of ANY status is already narrated by its own activity group:
  // while it is the turn's live tail that group keeps its dot + shimmer lit,
  // so the generic line must not also appear in the gap after a call settles
  // (running/awaiting were the only speaking states before — a settled tail
  // tool used to fall through here and pop the generic line onto a new row).
  return tail.kind === 'tool';
}

/** Split a settled turn: the last assistant answer OR terminal error is the
 * answer, everything before it is the collapsible work trace. Hiding a
 * terminal error in the work trace leaves a failed turn unexplained. */
export function settledReplySections(blocks: Block[]): { workBlocks: Block[]; answerBlocks: Block[] } {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === 'assistant' || blocks[i].kind === 'error') {
      return { workBlocks: blocks.slice(0, i), answerBlocks: blocks.slice(i) };
    }
  }
  return { workBlocks: blocks, answerBlocks: [] };
}

/** The reply text a turn's actions act on: every assistant block in the
 *  turn, in order — what the user sees as "the answer". */
export function turnReplyText(turn: Turn): string {
  return turn.body
    .filter((block): block is Extract<Block, { kind: 'assistant' }> => block.kind === 'assistant')
    .map((block) => block.text)
    .join('\n\n')
    .trim();
}

export function workTraceLabel(meta?: TurnMeta): string {
  const time = meta && typeof meta.durationMs === 'number' ? fmtDuration(meta.durationMs) : null;
  if (meta?.interrupted) return time ? `You stopped after ${time}` : 'You stopped';
  return time ? `Worked for ${time}` : 'Worked';
}

/** Compact wall-clock: "45s", "1m", "1m 24s". */
export function fmtDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}
