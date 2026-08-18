import assert from 'node:assert/strict';
import test from 'node:test';
import { mentionKeyAction } from '@/features/agent-panel/lib/mentionKeys';

test('mention keys stay owned by the composer only while suggestions are open', () => {
  assert.equal(mentionKeyAction('ArrowDown', true), 'next');
  assert.equal(mentionKeyAction('ArrowUp', true), 'previous');
  assert.equal(mentionKeyAction('Enter', true), 'accept');
  assert.equal(mentionKeyAction('Tab', true), 'accept');
  assert.equal(mentionKeyAction('Escape', true), 'dismiss');

  assert.equal(mentionKeyAction('ArrowDown', false), null);
  assert.equal(mentionKeyAction('Enter', false), null);
  assert.equal(mentionKeyAction('a', true), null);
});
