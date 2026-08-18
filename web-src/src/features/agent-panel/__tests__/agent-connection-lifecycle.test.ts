import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeAgentSocketIntentionally,
  terminalAgentState,
  type ClosableAgentSocket,
} from '@/features/agent-panel/lib/connectionLifecycle';
import type { Block } from '@/features/agent-panel/lib/types';

const transcript: Block[] = [
  { kind: 'user', id: 'user', text: 'Keep this question' },
  { kind: 'assistant', id: 'answer', text: 'Keep this partial answer' },
  { kind: 'tool', id: 'running', name: 'Bash', input: {}, status: 'running' },
  { kind: 'tool', id: 'approval', name: 'Write', input: {}, status: 'awaiting' },
];

test('renderer ready → raw close preserves transcript and terminalizes every tool', () => {
  const state = terminalAgentState({
    blocks: transcript,
    ready: true,
    exitReceived: false,
    agentShortName: 'Codex',
    currentFatal: null,
  });

  assert.equal(state.fatal, 'Codex disconnected unexpectedly.');
  assert.equal(state.recoveryLabel, 'Reconnect');
  assert.equal(state.turnActive, false);
  assert.deepEqual(state.queuedTurns, []);
  assert.deepEqual(state.blocks.slice(0, 2), transcript.slice(0, 2));
  assert.deepEqual(
    state.blocks.slice(2).map((block) => block.kind === 'tool' ? block.status : null),
    ['error', 'error'],
  );
});

test('fatal exit during a turn owns the cause once and preserves transcript', () => {
  const state = terminalAgentState({
    blocks: transcript,
    ready: true,
    exitReceived: true,
    agentShortName: 'Claude',
    message: 'Claude iterator failed.',
    currentFatal: null,
  });

  assert.equal(state.fatal, 'Claude iterator failed.');
  assert.equal(state.blocks.filter((block) => block.kind === 'error').length, 0);
  assert.deepEqual(state.blocks.slice(0, 2), transcript.slice(0, 2));
});

test('startup failure remains retryable and a normal exit invents no fatal cause', () => {
  assert.equal(terminalAgentState({
    blocks: [],
    ready: false,
    exitReceived: false,
    agentShortName: 'Claude',
    currentFatal: 'Claude CLI is not authenticated.',
  }).recoveryLabel, 'Retry');

  assert.equal(terminalAgentState({
    blocks: transcript,
    ready: true,
    exitReceived: true,
    agentShortName: 'Claude',
    currentFatal: null,
  }).fatal, null);
});

test('explicit renderer teardown detaches close handling before closing', () => {
  let closeEvents = 0;
  const sent: string[] = [];
  const socket: ClosableAgentSocket = {
    onclose: () => { closeEvents += 1; },
    readyState: 1,
    send: (value) => sent.push(value),
    close() { this.onclose?.(new Event('close')); },
  };

  closeAgentSocketIntentionally(socket);

  assert.deepEqual(sent, [JSON.stringify({ t: 'close' })]);
  assert.equal(closeEvents, 0);
  assert.equal(socket.onclose, null);
});

test('explicit teardown does not send a close frame after the socket starts closing', () => {
  const sent: string[] = [];
  let closed = false;
  const socket: ClosableAgentSocket = {
    onclose: () => undefined,
    readyState: 2,
    send: (value) => sent.push(value),
    close() { closed = true; },
  };

  closeAgentSocketIntentionally(socket);

  assert.deepEqual(sent, []);
  assert.equal(closed, true);
  assert.equal(socket.onclose, null);
});
