import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
} from '@/common/components/OverlayStack';

test('only the most recently registered blocking overlay is topmost', () => {
  assert.equal(isTopOverlay([], 'settings'), false);
  let stack = registerOverlay([], 'settings');
  assert.equal(isTopOverlay(stack, 'settings'), true);

  stack = registerOverlay(stack, 'confirm');
  assert.equal(isTopOverlay(stack, 'settings'), false);
  assert.equal(isTopOverlay(stack, 'confirm'), true);

  stack = unregisterOverlay(stack, 'confirm');
  assert.equal(isTopOverlay(stack, 'settings'), true);
});

test('overlay registration is idempotent and cleanup removes only its layer', () => {
  let stack = registerOverlay([], 'settings');
  stack = registerOverlay(stack, 'settings');
  stack = registerOverlay(stack, 'clipboard');
  assert.deepEqual(stack, ['settings', 'clipboard']);
  assert.deepEqual(unregisterOverlay(stack, 'missing'), stack);
  assert.deepEqual(unregisterOverlay(stack, 'settings'), ['clipboard']);
});
