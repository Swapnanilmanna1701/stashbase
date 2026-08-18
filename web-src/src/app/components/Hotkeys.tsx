import { useEffect } from 'react';
import { isEditorHistoryChord } from '@/features/documents';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { useAppActions, useUiShell } from '@/store/contexts/AppContext';
import { openLibrarySearch } from '@/common/lib/librarySearchTrigger';

type WindowShortcutInput = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>;

export function isWindowLifecycleShortcut(input: WindowShortcutInput): boolean {
  return (input.metaKey || input.ctrlKey)
    && input.shiftKey
    && !input.altKey
    && ['n', 'w'].includes(input.key.toLowerCase());
}

export function isCommandPaletteShortcut(input: WindowShortcutInput): boolean {
  const key = input.key.toLowerCase();
  return (key === 'f1' && !input.metaKey && !input.ctrlKey && !input.altKey && !input.shiftKey)
    || ((input.metaKey || input.ctrlKey) && input.shiftKey && !input.altKey && key === 'p');
}

/**
 * Global keyboard shortcuts. Renderless — mounts a `keydown` listener
 * on document and dispatches into the store.
 *
 *   Cmd/Ctrl + N        → new note
 *   Cmd/Ctrl + T        → new blank tab (Obsidian-style `+`)
 *   Cmd/Ctrl + S        → flush autosave immediately
 *   Cmd/Ctrl + O        → Quick Open for the active library
 *   Cmd/Ctrl + Shift + P / F1 → Command Palette
 *   Ctrl + Tab (Shift = reverse) → open/cycle Editor History (literal
 *                         Control on every platform, including macOS —
 *                         Cmd+Tab is the OS app switcher)
 *   Cmd/Ctrl + W        → close the active tab
 *   Cmd/Ctrl + F        → open in-document find bar
 *   Cmd/Ctrl + G        → next find match (Shift = prev). No-op when bar is closed.
 *   Cmd/Ctrl + Shift + E → reveal the sidebar file tree (VS Code convention)
 *   Cmd/Ctrl + Shift + F → open the library search popup
 *   Esc                  → close the find bar (only when it's open)
 *
 * `actions` is stable (memoised) and every handler is action-only — no
 * state reads inline — so the listener binds once and stays. Adding a
 * new shortcut here should not require any state plumbing.
 */
export function Hotkeys() {
  const { find } = useUiShell();
  const { actions, dispatch } = useAppActions();
  // Read state via ref so the listener doesn't rebind on every find
  // tick (which would shake out the listener registration unnecessarily).
  const findOpenRef = useLatestRef(find.open);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc closes the find bar without consuming the keystroke for
      // anyone else — `closeFind` is the only intent here.
      if (e.key === 'Escape' && findOpenRef.current) {
        e.preventDefault();
        actions.closeFind();
        return;
      }
      if (isCommandPaletteShortcut(e)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('stashbase-open-quick-open', { detail: { mode: 'commands' } }));
        return;
      }
      if (isEditorHistoryChord(e)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('stashbase-open-editor-history', { detail: { backward: e.shiftKey } }));
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      // VS Code conventions: ⌘⇧E reveals the file tree, ⌘⇧F searches.
      // Check shift-chords BEFORE the bare versions so ⌘⇧F doesn't
      // also trigger plain ⌘F's in-document find.
      if (e.shiftKey && k === 'e') {
        e.preventDefault();
        dispatch({ type: 'SIDEBAR_SET_COLLAPSED', collapsed: false });
        return;
      }
      if (e.shiftKey && k === 'f') {
        e.preventDefault();
        openLibrarySearch();
        return;
      }
      // The native application menu owns shifted New Window / Close Window
      // chords. Yield them here so they cannot also create or close a tab.
      if (isWindowLifecycleShortcut(e)) return;
      if (k === 'o') {
        e.preventDefault();
        window.dispatchEvent(new Event('stashbase-open-quick-open'));
        return;
      }
      if (k === 'n') {
        e.preventDefault();
        void actions.newNote();
      } else if (k === 't') {
        e.preventDefault();
        void actions.newTab();
      } else if (k === 's') {
        e.preventDefault();
        void actions.flushSave();
      } else if (k === 'w') {
        // Swallow the chord even when no tab is open so the browser /
        // Electron doesn't close the window out from under us.
        e.preventDefault();
        void actions.closeActiveTab();
      } else if (k === 'f') {
        e.preventDefault();
        actions.openFind();
      } else if (k === 'g') {
        // Cmd+G / Shift+Cmd+G step through matches without forcing the
        // user back into the find input. No-op when the bar is closed
        // so we don't surprise users mid-edit.
        if (!findOpenRef.current) return;
        e.preventDefault();
        if (e.shiftKey) actions.findPrev(); else actions.findNext();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [actions, dispatch]);
  return null;
}
