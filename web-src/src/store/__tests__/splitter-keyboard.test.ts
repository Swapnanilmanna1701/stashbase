import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_MAX_WIDTH,
  CHAT_MIN_WIDTH,
  isSplitterKey,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  resizeChatByKeyboard,
  resizeSidebarByKeyboard,
} from '@/store/state/stateHelpers';

test('splitter key guard accepts only the supported cross-platform keys', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.equal(isSplitterKey(key), true);
  }
  for (const key of ['ArrowUp', 'PageUp', 'Enter', '']) {
    assert.equal(isSplitterKey(key), false);
  }
});

test('sidebar separator supports platform-neutral arrow, Home, and End keys', () => {
  assert.deepEqual(
    resizeSidebarByKeyboard(280, false, 'ArrowLeft'),
    { width: 264, collapsed: false },
  );
  assert.deepEqual(
    resizeSidebarByKeyboard(SIDEBAR_MIN_WIDTH, false, 'ArrowLeft'),
    { width: SIDEBAR_MIN_WIDTH, collapsed: true },
  );
  assert.deepEqual(
    resizeSidebarByKeyboard(320, true, 'ArrowRight'),
    { width: 320, collapsed: false },
  );
  assert.deepEqual(
    resizeSidebarByKeyboard(320, false, 'Home'),
    { width: 320, collapsed: true },
  );
  assert.deepEqual(
    resizeSidebarByKeyboard(320, true, 'End'),
    { width: SIDEBAR_MAX_WIDTH, collapsed: false },
  );
});

test('chat separator follows its visual direction and clamps at both bounds', () => {
  assert.equal(resizeChatByKeyboard(480, 'ArrowLeft'), 496);
  assert.equal(resizeChatByKeyboard(480, 'ArrowRight'), 464);
  assert.equal(resizeChatByKeyboard(CHAT_MAX_WIDTH, 'ArrowLeft'), CHAT_MAX_WIDTH);
  assert.equal(resizeChatByKeyboard(CHAT_MIN_WIDTH, 'ArrowRight'), CHAT_MIN_WIDTH);
  assert.equal(resizeChatByKeyboard(480, 'Home'), CHAT_MIN_WIDTH);
  assert.equal(resizeChatByKeyboard(480, 'End'), CHAT_MAX_WIDTH);
});
