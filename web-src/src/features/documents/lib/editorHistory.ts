import { basename } from '@/common/lib/paths';
import type { Tab } from '@/store/state/state';

export interface EditorHistoryEntry {
  id: string;
  label: string;
}

/** Order currently-open tabs by Editor History (most-recent-first). Any
 *  open tab missing from `history` — defensively, should never happen since
 *  every tab-creating action records itself — is appended in strip order so
 *  no open editor is ever silently excluded from the navigator. */
export function orderEditorHistory(tabs: Tab[], history: string[]): EditorHistoryEntry[] {
  const known = new Set(history);
  const orderedIds = history.filter((id) => tabs.some((tab) => tab.id === id));
  const missingIds = tabs.filter((tab) => !known.has(tab.id)).map((tab) => tab.id);
  return [...orderedIds, ...missingIds].map((id) => {
    const tab = tabs.find((candidate) => candidate.id === id)!;
    return { id, label: tab.file ? basename(tab.file.name) : 'Untitled' };
  });
}

type ChordInput = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>;

/** The literal Control key + Tab, on every platform — never Cmd/Meta.
 *  Cmd+Tab is the macOS application switcher and is intercepted by the OS
 *  before it ever reaches an Electron window; VS Code's own default
 *  keybinding for this exact feature binds Control on macOS too, so this
 *  mirrors established precedent rather than the issue title's literal
 *  "Ctrl/Cmd+Tab" wording. */
export function isEditorHistoryChord(input: ChordInput): boolean {
  return input.ctrlKey && !input.metaKey && !input.altKey && input.key === 'Tab';
}

/** Highlighted index when the chord is first pressed. Forward starts on the
 *  previous editor (index 1); Shift (backward) starts on the oldest one —
 *  mirroring VS Code's two distinct entry actions (`...PreviousRecentlyUsedEditorInGroup`
 *  vs `...LeastRecentlyUsedEditorInGroup`). */
export function initialEditorHistoryIndex(length: number, backward: boolean): number {
  if (length <= 1) return 0;
  return backward ? length - 1 : 1;
}

/** Cycle the highlighted index while the chord is held. Wraps in both directions. */
export function cycleEditorHistoryIndex(current: number, length: number, backward: boolean): number {
  if (length === 0) return 0;
  const step = backward ? -1 : 1;
  return (current + step + length) % length;
}
