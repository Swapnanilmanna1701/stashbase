import assert from 'node:assert/strict';
import test from 'node:test';
import { isCommandPaletteShortcut, isWindowLifecycleShortcut } from '@/app/components/Hotkeys';

test('Command Palette owns F1 and Cmd/Ctrl+Shift+P only', () => {
  assert.equal(isCommandPaletteShortcut({ key: 'F1', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(isCommandPaletteShortcut({ key: 'p', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }), true);
  assert.equal(isCommandPaletteShortcut({ key: 'p', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }), false);
  assert.equal(isCommandPaletteShortcut({ key: 'F1', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }), false);
});

test('renderer yields shifted new-window and close-window chords to Electron', () => {
  assert.equal(
    isWindowLifecycleShortcut({
      key: 'W',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    }),
    true,
  );
  assert.equal(
    isWindowLifecycleShortcut({
      key: 'n',
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    }),
    true,
  );
});

test('renderer keeps legacy handling for unrelated or differently modified chords', () => {
  assert.equal(
    isWindowLifecycleShortcut({
      key: 's',
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    }),
    false,
  );
  assert.equal(
    isWindowLifecycleShortcut({
      key: 'w',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
    }),
    false,
  );
  assert.equal(
    isWindowLifecycleShortcut({
      key: 'w',
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    }),
    false,
  );
});
