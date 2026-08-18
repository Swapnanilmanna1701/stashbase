/**
 * The pure transcript turn model: grouping a flat block stream into turns,
 * splitting a settled turn into work + answer, deciding whether the stream's
 * tail already narrates itself, and the labels a finished turn carries.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fmtDuration,
  groupTurns,
  settledReplySections,
  tailBlockSpeaks,
  turnReplyText,
  workTraceLabel,
} from '@/features/agent-panel/lib/turnModel';
import type { Block } from '@/features/agent-panel/lib/types';

const user = (id: string, text = 'ask'): Block => ({ kind: 'user', id, text });
const assistant = (id: string, text: string): Block => ({ kind: 'assistant', id, text });
const thinking = (id: string): Block => ({ kind: 'thinking', id, text: 'Checking' });
const tool = (id: string, status: 'running' | 'awaiting' | 'done' | 'error' | 'denied'): Block =>
  ({ kind: 'tool', id, name: 'Bash', input: {}, status });

test('every user block opens a turn that owns the reply blocks after it', () => {
  const turns = groupTurns([
    user('u1'),
    thinking('t1'),
    assistant('a1', 'first'),
    user('u2'),
    assistant('a2', 'second'),
  ]);

  assert.deepEqual(turns.map((turn) => turn.key), ['u1', 'u2']);
  assert.deepEqual(turns.map((turn) => turn.head?.id), ['u1', 'u2']);
  assert.deepEqual(turns.map((turn) => turn.body.map((block) => block.id)), [['t1', 'a1'], ['a2']]);
});

test('reply blocks before any user block become a headless leading turn', () => {
  // Resumed history can start mid-reply; those blocks still need a turn to
  // render into, keyed off the first block so it stays distinct.
  const turns = groupTurns([assistant('a1', 'resumed'), user('u1'), assistant('a2', 'next')]);

  assert.deepEqual(turns.map((turn) => turn.key), ['lead-a1', 'u1']);
  assert.equal(turns[0].head, null);
  assert.deepEqual(turns[0].body.map((block) => block.id), ['a1']);
});

test('a user block with no reply yet still groups as an empty turn', () => {
  const turns = groupTurns([user('u1'), user('u2')]);

  assert.deepEqual(turns.map((turn) => turn.body), [[], []]);
});

test('a tail tool of ANY status narrates itself, so the generic line stays off', () => {
  // Regression: running/awaiting were once the only speaking states, so a
  // settled tail tool fell through and popped "…is working" onto a new row
  // in the gap between two consecutive calls.
  for (const status of ['running', 'awaiting', 'done', 'error', 'denied'] as const) {
    assert.equal(tailBlockSpeaks([user('u1'), tool('tool-1', status)]), true, status);
  }
});

test('live thinking speaks for itself while prose and errors do not', () => {
  assert.equal(tailBlockSpeaks([thinking('t1')]), true);
  assert.equal(tailBlockSpeaks([assistant('a1', 'done')]), false);
  assert.equal(tailBlockSpeaks([{ kind: 'error', id: 'e1', text: 'boom' }]), false);
  assert.equal(tailBlockSpeaks([]), false);
});

test('terminal Agent errors remain outside the collapsed work trace', () => {
  const work: Block = { kind: 'thinking', id: 'thinking-1', text: 'Checking' };
  const error: Block = { kind: 'error', id: 'error-1', text: 'Deterministic failure' };

  assert.deepEqual(settledReplySections([work, error]), {
    workBlocks: [work],
    answerBlocks: [error],
  });
});

test('the final assistant answer keeps the existing settled layout', () => {
  const work: Block = { kind: 'thinking', id: 'thinking-1', text: 'Checking' };
  const answer: Block = { kind: 'assistant', id: 'answer-1', text: 'Done' };

  assert.deepEqual(settledReplySections([work, answer]), {
    workBlocks: [work],
    answerBlocks: [answer],
  });
});

test('the split starts at the LAST answer, so trailing tool work stays visible', () => {
  const early = assistant('a1', 'interim');
  const step = tool('tool-1', 'done');
  const final = assistant('a2', 'final');

  assert.deepEqual(settledReplySections([early, step, final]), {
    workBlocks: [early, step],
    answerBlocks: [final],
  });
});

test('a turn with no assistant or error block is all work and no answer', () => {
  const step = tool('tool-1', 'done');

  assert.deepEqual(settledReplySections([step]), { workBlocks: [step], answerBlocks: [] });
  assert.deepEqual(settledReplySections([]), { workBlocks: [], answerBlocks: [] });
});

test('the copied reply is every assistant block in order, ignoring the work', () => {
  const text = turnReplyText({
    key: 'u1',
    head: null,
    body: [assistant('a1', 'first'), thinking('t1'), tool('tool-1', 'done'), assistant('a2', 'second\n')],
  });

  assert.equal(text, 'first\n\nsecond');
  assert.equal(turnReplyText({ key: 'u1', head: null, body: [thinking('t1')] }), '');
});

test('durations read as compact wall-clock and never round down to zero', () => {
  assert.equal(fmtDuration(400), '1s');
  assert.equal(fmtDuration(45_000), '45s');
  assert.equal(fmtDuration(60_000), '1m');
  assert.equal(fmtDuration(84_000), '1m 24s');
});

test('the work trace header names what happened, with timing only when measured', () => {
  // Resumed history carries no timing on the wire, so the label degrades to
  // the bare verb rather than inventing a duration.
  assert.equal(workTraceLabel(), 'Worked');
  assert.equal(workTraceLabel({ durationMs: 45_000, interrupted: false }), 'Worked for 45s');
  assert.equal(workTraceLabel({ durationMs: 84_000, interrupted: true }), 'You stopped after 1m 24s');
});
