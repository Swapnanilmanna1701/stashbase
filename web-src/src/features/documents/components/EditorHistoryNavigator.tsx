import { useEffect, useRef, useState } from 'react';
import {
  cycleEditorHistoryIndex,
  initialEditorHistoryIndex,
  orderEditorHistory,
  type EditorHistoryEntry,
} from '@/features/documents/lib/editorHistory';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { useSettingsBlocking } from '@/common/hooks/useSettingsBlocking';
import { useAppActions, useUiShell, useWorkspace } from '@/store/contexts/AppContext';
import {
  PICKER_LABEL_CLASS,
  PICKER_RESULTS_CLASS,
  PICKER_ROW_CLASS,
  PICKER_VEIL_CLASS,
  pickerPanelClass,
} from '@/common/lib/pickerChrome';

/** How long Control must stay down before the overlay actually renders. A
 *  quick tap-release resolves inside this window and never paints — only a
 *  deliberate hold (or a second Tab tap, which reveals immediately) shows
 *  the picker. Keeps a fast "switch to the last editor" tap flicker-free. */
const REVEAL_DELAY_MS = 150;

type Phase = 'closed' | 'pending' | 'open';

interface PendingListeners {
  keyup: (e: KeyboardEvent) => void;
  keydown: (e: KeyboardEvent) => void;
  blur: () => void;
}

/**
 * Ctrl+Tab / Ctrl+Shift+Tab Editor History navigator — a VS Code-style
 * Alt-Tab switcher over Editor History's tab-id MRU order (`state.editorHistory`),
 * not tab-strip order. There are no editor groups here, so this is the whole
 * feature: one navigator, one list.
 *
 * Chord lifecycle: the first Ctrl+Tab arms a pending switch to the previous
 * editor (Ctrl+Shift+Tab arms the oldest one) without rendering anything.
 * Releasing Control within `REVEAL_DELAY_MS` commits that pending switch
 * directly — a quick tap never shows the overlay. Only a hold past that
 * window, or a second Tab tap arriving first, reveals the overlay and
 * enters cycling mode; from there further Tab taps cycle, releasing Control
 * commits the highlighted entry through the same dirty-buffer-safe
 * `activateTab` used by the tab strip, and Escape cancels without changing
 * the active editor.
 *
 * Hotkeys owns the raw keydown for the chord (same as Quick Open's Cmd+O)
 * and dispatches `stashbase-open-editor-history` on every qualifying Tab
 * press while Ctrl is held — both the opening one and any cycling repeats;
 * this component tells them apart by phase. Once open, the veil itself
 * takes focus and owns Tab/Escape/Enter/keyup via React's synthetic
 * handlers so `stopPropagation` keeps those keystrokes from also reaching
 * Hotkeys' global listener — same topmost-owns-input contract Quick Open
 * already follows.
 *
 * While pending, nothing owns DOM focus yet, so release-to-commit and
 * Escape-to-cancel need their own `document`-level listeners — attached
 * *imperatively*, synchronously inside the chord handler, and closing
 * directly over the just-computed pending entry rather than reading
 * component state/refs. A `useEffect`, or a ref that only mirrors state
 * via the render-body assignment pattern, would only be current *after*
 * React commits and re-renders — exactly the window a fast tap-release
 * races. A commit landing before that point would either miss entirely
 * (unattached listener) or read a stale selection (unmirrored ref).
 * Closing over plain values computed in the same synchronous handler that
 * arms `pending` closes both races at once.
 */
export function EditorHistoryNavigator() {
  const workspace = useWorkspace();
  const uiShell = useUiShell();
  // Only used inside `stateRef`, read from an event-listener closure that
  // needs both the workspace fields (tabs/editorHistory/folder) and the
  // ui-shell blocking fields (modal/cascadePrompt/ctxMenu/renaming) — see
  // the merge note in AgentView.tsx / App.tsx for why this stays local.
  const state = { ...workspace, ...uiShell };
  const { actions } = useAppActions();
  const [phase, setPhase] = useState<Phase>('closed');
  const [entries, setEntries] = useState<EditorHistoryEntry[]>([]);
  const [active, setActive] = useState(0);
  const settingsBlocking = useSettingsBlocking();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingListenersRef = useRef<PendingListeners | null>(null);
  // Mutated synchronously alongside `setEntries` — unlike `entries` itself,
  // this is readable immediately within the same handler, before React has
  // re-rendered. Only the cycle-on-second-tap path needs it (the pending
  // commit path below closes over its own selection instead).
  const listRef = useRef<EditorHistoryEntry[]>([]);

  const stateRef = useLatestRef(state);
  const settingsBlockingRef = useLatestRef(settingsBlocking);
  /** The chord's SYNCHRONOUS phase authority. `phase` state only reaches
   * a render-mirrored ref after React commits — under load a second Tab
   * tap lands inside that window, reads a stale 'closed', and re-arms the
   * pending switch at index 1 instead of cycling. Every transition writes
   * this ref in the same synchronous handler that causes it. */
  const chordPhaseRef = useRef<Phase>('closed');

  function clearRevealTimer() {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  function detachPendingListeners() {
    const listeners = pendingListenersRef.current;
    if (!listeners) return;
    document.removeEventListener('keyup', listeners.keyup);
    document.removeEventListener('keydown', listeners.keydown);
    window.removeEventListener('blur', listeners.blur);
    pendingListenersRef.current = null;
  }

  // Cancel: nothing ever rendered (pending never revealed), so there's
  // nothing to restore focus to — it never left.
  const cancel = () => {
    clearRevealTimer();
    detachPendingListeners();
    chordPhaseRef.current = 'closed';
    setPhase('closed');
  };
  // Close: the overlay was visible and focus moved to it; restore it.
  const close = () => {
    clearRevealTimer();
    detachPendingListeners();
    chordPhaseRef.current = 'closed';
    setPhase('closed');
    requestAnimationFrame(() => restoreRef.current?.focus());
  };
  const commit = (id: string) => {
    clearRevealTimer();
    detachPendingListeners();
    chordPhaseRef.current = 'closed';
    setPhase('closed');
    requestAnimationFrame(() => restoreRef.current?.focus());
    void actions.activateTab(id);
  };

  function attachPendingListeners(pendingEntry: EditorHistoryEntry) {
    detachPendingListeners();
    const keyup = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return;
      e.preventDefault();
      commit(pendingEntry.id);
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      cancel();
    };
    const blur = () => cancel();
    document.addEventListener('keyup', keyup);
    document.addEventListener('keydown', keydown);
    window.addEventListener('blur', blur);
    pendingListenersRef.current = { keyup, keydown, blur };
  }

  useEffect(() => {
    function onChord(event: Event) {
      const backward = (event as CustomEvent<{ backward?: boolean }>).detail?.backward === true;
      if (chordPhaseRef.current === 'closed') {
        const s = stateRef.current;
        const blocked = settingsBlockingRef.current
          || Boolean(s.modal || s.cascadePrompt || s.ctxMenu || s.renaming)
          || !s.folder
          || document.querySelector('.modal-veil, .quick-open-blocking, .quick-open-veil');
        if (blocked) return;
        const list = orderEditorHistory(s.tabs, s.editorHistory);
        if (list.length < 2) return;
        const initialIndex = initialEditorHistoryIndex(list.length, backward);
        listRef.current = list;
        restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setEntries(list);
        setActive(initialIndex);
        chordPhaseRef.current = 'pending';
        setPhase('pending');
        attachPendingListeners(list[initialIndex]);
        revealTimerRef.current = setTimeout(() => {
          revealTimerRef.current = null;
          if (chordPhaseRef.current === 'pending') chordPhaseRef.current = 'open';
          setPhase((p) => (p === 'pending' ? 'open' : p));
        }, REVEAL_DELAY_MS);
        return;
      }
      // A second Tab tap arrived before the reveal timer — the hold is
      // deliberate, so reveal now already cycled. (If phase is already
      // 'open' this is a defensive no-op path: the focused container
      // should have consumed the keystroke itself via stopPropagation
      // before Hotkeys ever saw it to redispatch.)
      clearRevealTimer();
      detachPendingListeners();
      chordPhaseRef.current = 'open';
      setActive((index) => cycleEditorHistoryIndex(index, listRef.current.length, backward));
      setPhase('open');
    }
    window.addEventListener('stashbase-open-editor-history', onChord);
    return () => window.removeEventListener('stashbase-open-editor-history', onChord);
  }, []);

  // Unmount safety net — this component is always mounted at App level, but
  // don't leak a dangling timer/listener pair if that ever changes.
  useEffect(() => () => { clearRevealTimer(); detachPendingListeners(); }, []);

  useEffect(() => {
    if (phase !== 'open') return;
    containerRef.current?.focus();
    // Window losing OS-level focus (e.g. actually alt-tabbing to another
    // app) doesn't reliably blur the focused container, so watch for it
    // separately — otherwise a held Control released outside the window
    // never reaches our keyup handler and the navigator is stuck open.
    window.addEventListener('blur', close);
    return () => window.removeEventListener('blur', close);
  }, [phase]);

  // Defensive close if the folder switches (or a tab closes some other way)
  // out from under an open navigator — TABS_RESET already clears
  // tabs/editorHistory on folder change, so a stale entry means our list is
  // no longer valid rather than that we should keep cycling it.
  useEffect(() => {
    if (phase === 'open' && entries.some((entry) => !state.tabs.some((tab) => tab.id === entry.id))) {
      close();
    }
  }, [phase, entries, state.tabs]);

  if (phase !== 'open') return null;

  return (
    <div
      /* `quick-open-blocking` is a topmost-surface marker class other
       * overlays query — it carries no styles of its own. */
      className={`quick-open-blocking ${PICKER_VEIL_CLASS}`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={containerRef}
        className={pickerPanelClass('narrow')}
        role="dialog"
        aria-modal="true"
        aria-label="Editor History"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); close();
          } else if (event.key === 'Enter') {
            event.preventDefault(); event.stopPropagation();
            const entry = entries[active];
            if (entry) commit(entry.id);
          } else if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); event.stopPropagation();
            const backward = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);
            setActive((index) => cycleEditorHistoryIndex(index, entries.length, backward));
          }
        }}
        onKeyUp={(event) => {
          if (event.key !== 'Control') return;
          event.preventDefault(); event.stopPropagation();
          const entry = entries[active];
          if (entry) commit(entry.id); else close();
        }}
        onBlur={() => close()}
      >
        <div className={PICKER_LABEL_CLASS}>Editor History</div>
        <ul
          className={PICKER_RESULTS_CLASS}
          role="listbox"
          aria-label="Recently used editors"
          aria-activedescendant={entries[active] ? `editor-history-${active}` : undefined}
        >
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              id={`editor-history-${index}`}
              role="option"
              aria-selected={index === active}
              className={PICKER_ROW_CLASS}
              onMouseMove={() => setActive(index)}
              onMouseDown={(event) => { event.preventDefault(); commit(entry.id); }}
            >
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
