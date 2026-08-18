/**
 * The pure transcript transforms behind the tool/permission half of the
 * agent protocol: opening a tool card, streaming and completing its output,
 * attaching a permission prompt (including the race where the prompt beats
 * the card), answering that prompt, and settling tools a turn left running.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendToolOutput,
  applyPermissionReply,
  completeToolCard,
  markToolAwaitingPermission,
  openToolCard,
  settleRunningTools,
} from '@/features/agent-panel/lib/transcriptEvents';
import type { Block, ToolBlock, ToolStatus } from '@/features/agent-panel/lib/types';

const user = (id: string): Block => ({ kind: 'user', id, text: 'ask' });
const tool = (id: string, status: ToolStatus, result?: string): Block =>
  ({ kind: 'tool', id, name: 'Bash', input: { command: 'ls' }, status, result });
const toolAt = (blocks: Block[], id: string): ToolBlock =>
  blocks.find((block): block is ToolBlock => block.kind === 'tool' && block.id === id)!;

test('a tool event appends a running card carrying the call name and input', () => {
  const next = openToolCard([user('u1')], { t: 'tool', id: 'x1', name: 'Edit', input: { path: 'a.md' } });

  assert.deepEqual(next.map((block) => block.kind), ['user', 'tool']);
  assert.deepEqual(toolAt(next, 'x1'), {
    kind: 'tool', id: 'x1', name: 'Edit', input: { path: 'a.md' }, status: 'running',
  });
});

test('transcript transforms never mutate the block list they are given', () => {
  const before: Block[] = [tool('x1', 'running')];
  const snapshot = structuredClone(before);

  openToolCard(before, { t: 'tool', id: 'x2', name: 'Bash', input: {} });
  appendToolOutput(before, { t: 'tool-delta', id: 'x1', delta: 'out' });
  completeToolCard(before, { t: 'tool-result', id: 'x1', content: 'done', isError: false });
  settleRunningTools(before, false);
  applyPermissionReply(before, 'x1', false);

  assert.deepEqual(before, snapshot);
});

test('tool deltas accumulate on the addressed card and leave the rest alone', () => {
  const started: Block[] = [tool('x1', 'running'), tool('x2', 'running')];
  const once = appendToolOutput(started, { t: 'tool-delta', id: 'x1', delta: 'first ' });
  const twice = appendToolOutput(once, { t: 'tool-delta', id: 'x1', delta: 'second' });

  assert.equal(toolAt(twice, 'x1').result, 'first second');
  assert.equal(toolAt(twice, 'x2').result, undefined);
  assert.equal(toolAt(twice, 'x1').status, 'running');
});

test('a delta for an unknown tool id changes nothing', () => {
  const started: Block[] = [tool('x1', 'running')];

  assert.deepEqual(appendToolOutput(started, { t: 'tool-delta', id: 'nope', delta: 'out' }), started);
});

test('a denied card is frozen: late output and late results never repaint it', () => {
  const denied: Block[] = [tool('x1', 'denied', 'rejected')];

  assert.deepEqual(appendToolOutput(denied, { t: 'tool-delta', id: 'x1', delta: ' more' }), denied);
  assert.deepEqual(
    completeToolCard(denied, { t: 'tool-result', id: 'x1', content: 'ran anyway', isError: false }),
    denied,
  );
});

test('a successful tool result settles the card as done and replaces streamed output', () => {
  const streamed = appendToolOutput([tool('x1', 'running')], { t: 'tool-delta', id: 'x1', delta: 'partial' });
  const next = completeToolCard(streamed, { t: 'tool-result', id: 'x1', content: 'full output', isError: false });

  assert.equal(toolAt(next, 'x1').status, 'done');
  assert.equal(toolAt(next, 'x1').result, 'full output');
});

test('a failed tool result settles the card as error', () => {
  const next = completeToolCard([tool('x1', 'running')], { t: 'tool-result', id: 'x1', content: 'boom', isError: true });

  assert.equal(toolAt(next, 'x1').status, 'error');
  assert.equal(toolAt(next, 'x1').result, 'boom');
});

test('a permission prompt attaches to the tool card it belongs to', () => {
  const next = markToolAwaitingPermission([user('u1'), tool('x1', 'running')], {
    t: 'permission', id: 'p1', toolUseId: 'x1', name: 'Bash', title: 'Run ls', input: { command: 'ls' },
  });

  assert.equal(next.length, 2);
  assert.deepEqual(toolAt(next, 'x1'), {
    kind: 'tool', id: 'x1', name: 'Bash', input: { command: 'ls' }, status: 'awaiting',
    permId: 'p1', permTitle: 'Run ls', result: undefined,
  });
});

test('a permission prompt that beats its tool card creates the card instead', () => {
  const next = markToolAwaitingPermission([user('u1')], {
    t: 'permission', id: 'p1', toolUseId: 'x9', name: 'Edit', title: null, input: { path: 'a.md' },
  });

  assert.deepEqual(next.map((block) => block.kind), ['user', 'tool']);
  assert.deepEqual(toolAt(next, 'x9'), {
    kind: 'tool', id: 'x9', name: 'Edit', input: { path: 'a.md' }, status: 'awaiting',
    permId: 'p1', permTitle: null,
  });
});

test('allowing a permission resumes the card and consumes the prompt', () => {
  const awaiting = markToolAwaitingPermission([tool('x1', 'running')], {
    t: 'permission', id: 'p1', toolUseId: 'x1', name: 'Bash', title: 'Run ls', input: {},
  });
  const next = applyPermissionReply(awaiting, 'x1', true);

  assert.equal(toolAt(next, 'x1').status, 'running');
  assert.equal(toolAt(next, 'x1').permId, undefined);
  // The prompt's title stays on the card so the decision remains readable.
  assert.equal(toolAt(next, 'x1').permTitle, 'Run ls');
});

test('denying a permission freezes the card as denied', () => {
  const awaiting = markToolAwaitingPermission([tool('x1', 'running')], {
    t: 'permission', id: 'p1', toolUseId: 'x1', name: 'Bash', title: null, input: {},
  });
  const next = applyPermissionReply(awaiting, 'x1', false);

  assert.equal(toolAt(next, 'x1').status, 'denied');
  assert.equal(toolAt(next, 'x1').permId, undefined);
});

test('turn end settles every still-running tool and leaves settled ones untouched', () => {
  const blocks: Block[] = [
    tool('x1', 'running'),
    tool('x2', 'done', 'ok'),
    tool('x3', 'denied'),
    tool('x4', 'awaiting'),
    tool('x5', 'error'),
  ];
  const next = settleRunningTools(blocks, false);

  assert.deepEqual(next.map((block) => (block as ToolBlock).status), ['done', 'done', 'denied', 'awaiting', 'error']);
});

test('a failed turn settles its still-running tools as errors', () => {
  const next = settleRunningTools([tool('x1', 'running'), tool('x2', 'done')], true);

  assert.deepEqual(next.map((block) => (block as ToolBlock).status), ['error', 'done']);
});

test('settling running tools preserves whatever output they had streamed', () => {
  const streamed = appendToolOutput([tool('x1', 'running')], { t: 'tool-delta', id: 'x1', delta: 'half a line' });
  const next = settleRunningTools(streamed, false);

  assert.equal(toolAt(next, 'x1').result, 'half a line');
});

test('a permission reply for another card leaves the transcript alone', () => {
  const blocks: Block[] = [tool('x1', 'awaiting')];

  assert.deepEqual(applyPermissionReply(blocks, 'x2', true), blocks);
});
