import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPrimaryShiftShortcut,
  isMacPlatform,
} from '@/common/lib/platformShortcuts';

test('shortcut labels use macOS glyphs only on macOS', () => {
  assert.equal(isMacPlatform('MacIntel'), true);
  assert.equal(isMacPlatform('Win32'), false);
  assert.equal(isMacPlatform('Linux x86_64'), false);
  assert.equal(formatPrimaryShiftShortcut('e', 'MacIntel'), '⌘⇧E');
  assert.equal(formatPrimaryShiftShortcut('f', 'Win32'), 'Ctrl+Shift+F');
  assert.equal(formatPrimaryShiftShortcut('e', 'Linux x86_64'), 'Ctrl+Shift+E');
});
