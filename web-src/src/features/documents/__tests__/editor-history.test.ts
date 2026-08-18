import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cycleEditorHistoryIndex,
  initialEditorHistoryIndex,
  isEditorHistoryChord,
  orderEditorHistory,
} from '@/features/documents/lib/editorHistory';
import type { Tab } from '@/store/state/state';

function tab(id: string, name: string | null): Tab {
  return {
    id,
    file: name ? { name, format: 'md', content: '' } : null,
    editMode: false,
    dirty: false,
    pendingAnchor: null,
    pendingHighlight: null,
    saveStatus: { text: '', cls: '' },
  };
}

test('Editor History orders open tabs by MRU, not tab-strip order', () => {
  const tabs = [tab('a', 'a.md'), tab('b', 'b.md'), tab('c', 'c.md')];
  const entries = orderEditorHistory(tabs, ['c', 'a', 'b']);
  assert.deepEqual(entries.map((entry) => entry.id), ['c', 'a', 'b']);
  assert.deepEqual(entries.map((entry) => entry.label), ['c.md', 'a.md', 'b.md']);
});

test('Editor History appends open tabs missing from recorded history defensively', () => {
  const tabs = [tab('a', 'a.md'), tab('b', 'b.md')];
  const entries = orderEditorHistory(tabs, ['a']);
  assert.deepEqual(entries.map((entry) => entry.id), ['a', 'b']);
});

test('Editor History drops history entries whose tab already closed', () => {
  const tabs = [tab('a', 'a.md')];
  const entries = orderEditorHistory(tabs, ['b', 'a', 'c']);
  assert.deepEqual(entries.map((entry) => entry.id), ['a']);
});

test('Editor History labels a blank tab', () => {
  const tabs = [tab('a', null), tab('b', 'b.md')];
  const entries = orderEditorHistory(tabs, ['a', 'b']);
  assert.equal(entries[0].label, 'Untitled');
  assert.equal(entries[1].label, 'b.md');
});

test('the chord is the literal Control key, never Cmd/Meta', () => {
  assert.equal(isEditorHistoryChord({ key: 'Tab', ctrlKey: true, metaKey: false, altKey: false }), true);
  assert.equal(isEditorHistoryChord({ key: 'Tab', ctrlKey: false, metaKey: true, altKey: false }), false);
  assert.equal(isEditorHistoryChord({ key: 'Tab', ctrlKey: true, metaKey: false, altKey: true }), false);
  assert.equal(isEditorHistoryChord({ key: 'q', ctrlKey: true, metaKey: false, altKey: false }), false);
});

test('forward opens on the previous editor; backward opens on the oldest', () => {
  assert.equal(initialEditorHistoryIndex(4, false), 1);
  assert.equal(initialEditorHistoryIndex(4, true), 3);
  assert.equal(initialEditorHistoryIndex(1, false), 0);
});

test('cycling wraps in both directions', () => {
  assert.equal(cycleEditorHistoryIndex(2, 3, false), 0);
  assert.equal(cycleEditorHistoryIndex(0, 3, true), 2);
  assert.equal(cycleEditorHistoryIndex(1, 3, false), 2);
});
