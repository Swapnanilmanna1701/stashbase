/**
 * The two draggable dividers of the workspace shell: sidebar ↔ main pane
 * and main pane ↔ chat panel. Both are keyboard-operable ARIA separators;
 * the e2e layout journey asserts their names and aria-value* attributes,
 * so DOM structure and labels here are load-bearing.
 */
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import '@/features/workspace/workspace.css';
import { useAppActions, useChat, useWorkspace } from '@/store/contexts/AppContext';
import {
  clampChatWidth,
  CHAT_MAX_WIDTH,
  CHAT_MIN_WIDTH,
  isSplitterKey,
  resizeChatByKeyboard,
  resizeSidebarByKeyboard,
  SIDEBAR_COLLAPSE_AT,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from '@/store/state/state';

/** Vertical drag handle on the sidebar's right edge (between the side
 *  panel and the main pane). Drags the panel width within [MIN, MAX];
 *  dragging narrower than COLLAPSE_AT collapses the sidebar entirely
 *  (the titlebar toggle is the visible way back in). Stays mounted
 *  while collapsed (pinned at the window's left edge) so the user can
 *  still grab it and drag the panel back open. Positioned absolutely so
 *  it doesn't perturb the `.app` grid tracks; pointer-capture keeps the
 *  drag alive once the cursor crosses into the main pane. */
export function SidebarSplitter() {
  const state = useWorkspace();
  const { dispatch } = useAppActions();
  // `w` is the panel width at drag start. `done` ends the gesture after a
  // collapse or a re-open snap so each grab does exactly one thing —
  // resize, OR collapse, OR re-open. Mixing them is what produced the
  // min-width "gap": there's a hard discontinuity between collapsed (0)
  // and the 200px floor, so you can't smoothly drag *across* it. Instead
  // we snap: pull a collapsed panel right past a few px → it pops open at
  // its remembered width; pull an open panel below COLLAPSE_AT → it snaps
  // shut. Re-grab to do the next thing.
  const startRef = useRef<{ x: number; w: number; collapsed: boolean; done: boolean } | null>(null);
  // The `.app` grid animates `grid-template-columns` (220ms) for smooth
  // collapse/expand toggles — but during a live drag that lag makes the
  // panel edge trail the splitter, opening a blank gap. We drop the
  // transition for the duration of the drag via this class.
  const appRef = useRef<HTMLElement | null>(null);
  // Live drag feedback batches through rAF + the `--sidebar-width` CSS var
  // (the same var App renders from state, on the same `.app` element) —
  // one store dispatch per gesture instead of per pointermove, same scheme
  // as ChatSplitter below. The grid column and this handle's `left` both
  // read the var, so the panel still tracks the cursor every frame. State
  // dispatches happen only at the discrete points: the collapse/re-open
  // snaps and gesture end. The keyboard path stays dispatch-per-step —
  // each keystroke is already a discrete, announced value change.
  const pendingWidthRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  function writePendingWidth() {
    frameRef.current = null;
    const width = pendingWidthRef.current;
    if (width !== null) appRef.current?.style.setProperty('--sidebar-width', `${width}px`);
  }

  function queueWidth(width: number) {
    pendingWidthRef.current = width;
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(writePendingWidth);
  }

  function cancelPendingFrame() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    appRef.current?.classList.remove('sidebar-dragging');
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    startRef.current = {
      x: e.clientX,
      w: state.sidebarWidth,
      collapsed: state.sidebarCollapsed,
      done: false,
    };
    pendingWidthRef.current = null;
    appRef.current = e.currentTarget.parentElement as HTMLElement | null;
    appRef.current?.classList.add('sidebar-dragging');
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start || start.done) return;
    const dx = e.clientX - start.x;
    if (start.collapsed) {
      // Collapsed: a small rightward pull re-opens at the remembered
      // width (state.sidebarWidth survives a collapse untouched). One
      // discrete snap — we don't track width during the same gesture,
      // which is what avoided the min-width gap.
      if (dx > 6) {
        dispatch({ type: 'SIDEBAR_SET_COLLAPSED', collapsed: false });
        start.done = true;
      }
      return;
    }
    // Open: track width; pulling narrower than COLLAPSE_AT snaps shut.
    const next = start.w + dx;
    if (next < SIDEBAR_COLLAPSE_AT) {
      // Commit the last width the drag showed before collapsing, so the
      // remembered re-open width matches what the panel was resized to —
      // then React's re-render reconciles the CSS var with state.
      cancelPendingFrame();
      const lastWidth = pendingWidthRef.current;
      pendingWidthRef.current = null;
      if (lastWidth !== null) dispatch({ type: 'SIDEBAR_WIDTH', width: lastWidth });
      dispatch({ type: 'SIDEBAR_SET_COLLAPSED', collapsed: true });
      start.done = true;
      return;
    }
    // Snap the floor so the panel doesn't visually dip below MIN before
    // the collapse kicks in; clamp the ceiling here too — the imperative
    // var write bypasses the reducer's [MIN, MAX] clamp during the drag.
    queueWidth(Math.min(Math.max(next, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH));
  }
  function onPointerUp() {
    const start = startRef.current;
    cancelPendingFrame();
    const finalWidth = pendingWidthRef.current;
    if (start && !start.done && finalWidth !== null) {
      writePendingWidth();
      dispatch({ type: 'SIDEBAR_WIDTH', width: finalWidth });
    }
    startRef.current = null;
    pendingWidthRef.current = null;
    appRef.current?.classList.remove('sidebar-dragging');
    appRef.current = null;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isSplitterKey(event.key)) return;
    event.preventDefault();
    const next = resizeSidebarByKeyboard(
      state.sidebarWidth,
      state.sidebarCollapsed,
      event.key,
    );
    if (next.width !== state.sidebarWidth) {
      dispatch({ type: 'SIDEBAR_WIDTH', width: next.width });
    }
    if (next.collapsed !== state.sidebarCollapsed) {
      dispatch({ type: 'SIDEBAR_SET_COLLAPSED', collapsed: next.collapsed });
    }
  }

  return (
    <div
      className="sidebar-splitter"
      role="separator"
      tabIndex={0}
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={state.sidebarCollapsed ? 0 : state.sidebarWidth}
      aria-valuetext={state.sidebarCollapsed ? 'Collapsed' : `${state.sidebarWidth} pixels`}
      style={{
        left: state.sidebarCollapsed
          ? '0px'
          : `var(--sidebar-width, ${SIDEBAR_MAX_WIDTH}px)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}

/** Vertical drag handle between the main pane and the chat panel.
 *  Drags the chat-panel width; lifecycle is pointer-capture style so the
 *  drag survives even if the cursor briefly leaves the handle. */
export function ChatSplitter() {
  const state = useChat();
  const { dispatch } = useAppActions();
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const appRef = useRef<HTMLElement | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  function widthAt(e: ReactPointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    return start ? clampChatWidth(start.w - (e.clientX - start.x)) : null;
  }

  function writePendingWidth() {
    frameRef.current = null;
    const width = pendingWidthRef.current;
    if (width !== null) appRef.current?.style.setProperty('--chat-width', `${width}px`);
  }

  function queueWidth(width: number) {
    pendingWidthRef.current = width;
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(writePendingWidth);
  }

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    appRef.current?.classList.remove('chat-dragging');
  }, []);

  function finish(e: ReactPointerEvent<HTMLDivElement>) {
    const finalWidth = widthAt(e) ?? pendingWidthRef.current;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (finalWidth !== null) {
      pendingWidthRef.current = finalWidth;
      writePendingWidth();
      dispatch({ type: 'CHAT_WIDTH', width: finalWidth });
    }
    startRef.current = null;
    pendingWidthRef.current = null;
    appRef.current?.classList.remove('chat-dragging');
    appRef.current = null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    startRef.current = { x: e.clientX, w: state.chatWidth };
    appRef.current = e.currentTarget.parentElement as HTMLElement | null;
    appRef.current?.classList.add('chat-dragging');
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const width = widthAt(e);
    if (width !== null) queueWidth(width);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isSplitterKey(event.key)) return;
    event.preventDefault();
    dispatch({
      type: 'CHAT_WIDTH',
      width: resizeChatByKeyboard(
        state.chatWidth,
        event.key,
      ),
    });
  }

  return (
    <div
      className="chat-splitter"
      role="separator"
      tabIndex={0}
      aria-label="Resize Agent chat panel"
      aria-orientation="vertical"
      aria-valuemin={CHAT_MIN_WIDTH}
      aria-valuemax={CHAT_MAX_WIDTH}
      aria-valuenow={state.chatWidth}
      aria-valuetext={`${state.chatWidth} pixels`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={onKeyDown}
    />
  );
}
