import assert from 'node:assert/strict';
import test from 'node:test';
import { settledReplySections } from '../components/agent/AgentMessages';
import type { Block } from '../components/agent/types';

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
