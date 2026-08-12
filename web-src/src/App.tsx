import {
  useEffect,
  Suspense,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface ElectronBridge {
  openFolderDialog?: (opts?: unknown) => Promise<string | null>;
  setWindowFolder?: (folder: string | null) => Promise<boolean>;
  onClipboardImage?: (handler: (offer: ClipboardOffer) => void) => (() => void);
  markClipboardHandled?: (hash: string) => void;
}
import { openExternalUrl } from './lib/externalLink';
import { Sidebar } from './components/Sidebar';
import { TitlebarControls } from './components/TitlebarControls';
import { MainPane } from './components/MainPane';
import { DropVeil } from './components/Overlays';
import { EmbedderRequireKeyGate } from './components/EmbedderRequireKeyGate';
import { Hotkeys } from './components/Hotkeys';
import { ClipboardImportModal, type ClipboardOffer } from './components/ClipboardImportModal';
import { CascadePromptModal } from './components/CascadePromptModal';
import { AlertConfirmModal } from './components/AlertConfirmModal';
import { Toasts } from './components/Toasts';
import { SettingsPortal, openSettings } from './components/SettingsModal';
import { QuickOpen } from './components/QuickOpen';
import { LibrarySearch } from './components/LibrarySearch';
import { EditorHistoryNavigator } from './components/EditorHistoryNavigator';
import { DocumentOutlineProvider } from './components/DocumentOutlineContext';
import { ErrorBoundary, LazyLoadBoundary, lazyWithRetry } from './components/ErrorBoundary';
import { OverlayStackProvider } from './components/OverlayStack';
import { ReportBugLauncher } from './components/ReportBugLauncher';
import { AppProvider, useApp } from './store/AppContext';
import {
  clampChatWidth,
  CHAT_MAX_WIDTH,
  CHAT_MIN_WIDTH,
  isSplitterKey,
  makeChatTab,
  resizeChatByKeyboard,
  resizeSidebarByKeyboard,
  SIDEBAR_COLLAPSE_AT,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './store/state';
import { switchWelcomeTabPlan } from './components/agent/folderState';
import { useGlobalDragDrop } from './hooks/useGlobalDragDrop';
import { getWindowId } from './api';
import { api } from './api';
import { applyAppearance, subscribeToAppearance } from './appearance';
import { isTrustedPreviewSource } from './lib/previewMessages';
import { readPreferredAgent } from './agentPreference';
import {
  COMPACT_WORKSPACE_QUERY,
  resolveWorkspaceLayout,
  shouldAutoCollapseChat,
} from './workspaceLayout';

const LazyChatPane = lazyWithRetry(() => import('./components/ChatPane').then((mod) => ({ default: mod.ChatPane })));
const LazyUnsupportedFilesModalGate = lazyWithRetry(() =>
  import('./components/UnsupportedFilesModal').then((mod) => ({ default: mod.UnsupportedFilesModalGate })),
);
const LazyContextMenu = lazyWithRetry(() => import('./components/ContextMenu'));
const LazyImageLightbox = lazyWithRetry(() =>
  import('./components/ImageLightbox').then((mod) => ({ default: mod.ImageLightbox })),
);

/**
 * Top-level shell. Wraps everything in <AppProvider> (the single
 * store) and mounts the global drag-drop / hotkey side effects.
 *
 * There is no landing page: the app boots straight into the workspace,
 * and the sidebar's library list is how folders are added and switched.
 */
export function App() {
  return (
    <>
      <ErrorBoundary>
        <OverlayStackProvider>
          <ErrorBoundary>
            <AppProvider>
              <AppBody />
            </AppProvider>
          </ErrorBoundary>
        </OverlayStackProvider>
      </ErrorBoundary>
      <Suspense fallback={null}><ReportBugLauncher /></Suspense>
    </>
  );
}

function AppBody() {
  const veilHot = useGlobalDragDrop();
  const { state, actions, dispatch } = useApp();
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [clipboardOffer, setClipboardOffer] = useState<ClipboardOffer | null>(null);
  const [pendingClipboardOffer, setPendingClipboardOffer] = useState<ClipboardOffer | null>(null);
  const initialFolderPending = useRef(new URLSearchParams(window.location.search).has('folder'));
  const compactWorkspace = useCompactWorkspace();
  const hasDocument = state.tabs.length > 0;
  const workspaceLayout = resolveWorkspaceLayout({
    chatOpen: state.chatOpen,
    hasDocument,
    compact: compactWorkspace,
  });
  const defaultChatFolderRef = useRef('');
  const responsiveChatCollapsedRef = useRef(false);
  const previousWorkspaceRef = useRef({
    folderPath: '',
    hasDocument: false,
    compact: compactWorkspace,
  });
  // Mount the chat panel lazily on first open and then NEVER
  // unmount it — hiding the panel only collapses the column via CSS,
  // the underlying agent WebSocket sessions stay alive. Killing them
  // on every collapse would lose Claude Code's chat history and any
  // in-flight agent run. The titlebar's chat toggle shows/hides the
  // panel; the sidebar's New Chat split button starts a fresh session
  // (and also reopens the hidden panel).
  const [chatMounted, setChatMounted] = useState(state.chatOpen);
  // Prime the agent registry once per window (always-mounted home: the
  // chat surfaces are lazy/conditional). Each AgentView refreshes the
  // catalog after every connection outcome so runtime failures and
  // retries stay visible; this initial fetch keeps runtime states
  // loading before any chat surface mounts.
  useEffect(() => {
    let cancelled = false;
    api.listAgents().then((r) => {
      if (!cancelled) dispatch({ type: 'AGENTS_LOADED', agents: r.clis });
    }).catch(() => { /* renderer falls back to local defaults */ });
    return () => { cancelled = true; };
  }, [dispatch]);
  useEffect(() => {
    let receivedWindowUpdate = false;
    const unsubscribe = subscribeToAppearance((preferences) => {
      receivedWindowUpdate = true;
      applyAppearance(preferences);
    });
    void api.appearance().then((preferences) => {
      if (!receivedWindowUpdate) applyAppearance(preferences);
    }).catch(() => {
      // The initial light/system-safe CSS remains usable if config is absent
      // or temporarily unreadable; Settings exposes the recoverable error.
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (state.chatOpen) setChatMounted(true);
  }, [state.chatOpen]);
  useEffect(() => {
    if (!state.folderPath) {
      defaultChatFolderRef.current = '';
      // Boot default is the library-scoped New Chat workspace: no folder
      // is selected until the user clicks one, and the chat panel opens
      // with one blank tab (its scope resolves to Library).
      if (state.booted && state.chatTabs.length === 0) {
        const agent = readPreferredAgent();
        dispatch({
          type: 'CHAT_AGENT_OPEN',
          agent,
          tab: makeChatTab(agent, state.chatTabs),
        });
      }
      return;
    }
    if (defaultChatFolderRef.current === state.folderPath) return;
    defaultChatFolderRef.current = state.folderPath;
    const agent = readPreferredAgent();
    // Chat tabs (and their scope-bound sessions) survive folder switches.
    // A window with NO chat tabs gets the one fresh tab on folder open
    // (panel opens); a switch instead activates a welcome tab for the new
    // folder without touching panel visibility — reusing a completely
    // blank tab when one exists (it follows the window default on its
    // next connect), else creating a fresh tab. Started chats, drafts,
    // and attachments are never rebound by this.
    if (state.chatTabs.length === 0) {
      dispatch({
        type: 'CHAT_AGENT_OPEN',
        agent,
        tab: makeChatTab(agent, state.chatTabs),
      });
      return;
    }
    const plan = switchWelcomeTabPlan(state.chatTabs, state.activeChatTabId, state.folderPath, agent);
    if (plan.kind === 'activate') {
      if (state.activeChatTabId !== plan.id) dispatch({ type: 'CHAT_TAB_ACTIVATE', id: plan.id });
    } else if (plan.kind === 'new') {
      dispatch({ type: 'CHAT_TAB_NEW', tab: makeChatTab(agent, state.chatTabs) });
    }
    // plan.kind === 'none': the active chat is already bound to the new
    // folder (create_project auto-select) — it IS the working entry.
  }, [dispatch, state.activeChatTabId, state.booted, state.chatTabs, state.folderPath]);
  useEffect(() => {
    const previous = previousWorkspaceRef.current;
    const folderChanged = previous.folderPath !== state.folderPath;
    previousWorkspaceRef.current = {
      folderPath: state.folderPath,
      hasDocument,
      compact: compactWorkspace,
    };

    if (folderChanged) {
      responsiveChatCollapsedRef.current = false;
      return;
    }
    if (shouldAutoCollapseChat({
      chatOpen: state.chatOpen,
      hasDocument,
      compact: compactWorkspace,
      previousHasDocument: previous.hasDocument,
      previousCompact: previous.compact,
    })) {
      responsiveChatCollapsedRef.current = true;
      dispatch({ type: 'CHAT_TOGGLE' });
      return;
    }
    if (responsiveChatCollapsedRef.current && state.chatOpen) {
      // The user explicitly reopened Chat while the document is still
      // active, so future document changes must not fight that choice.
      responsiveChatCollapsedRef.current = false;
      return;
    }
    if (
      responsiveChatCollapsedRef.current
      && !state.chatOpen
      && (!hasDocument || !compactWorkspace)
    ) {
      responsiveChatCollapsedRef.current = false;
      dispatch({ type: 'CHAT_TOGGLE' });
    }
  }, [compactWorkspace, dispatch, hasDocument, state.chatOpen, state.folderPath]);
  useEffect(() => {
    document.title = state.folder ? `${state.folder} — StashBase` : 'StashBase';
  }, [state.folder]);
  useEffect(() => {
    // createWindow registers its requested folder immediately so a second
    // "Open in New Window" click can focus the still-loading window. Preserve
    // that pending identity until bootstrap either opens it or settles
    // without a folder (open failure surfaces as a toast).
    if (initialFolderPending.current && !state.folderPath && !state.booted) return;
    initialFolderPending.current = false;
    const bridge = (window as { electron?: ElectronBridge }).electron;
    void bridge?.setWindowFolder?.(state.folderPath || null);
    // Boot has pushed its final window-folder registration (boot never
    // selects a folder on its own — only an explicit ?folder request or a
    // same-window restore does). The multi-window smoke keys off this
    // marker before assigning folders programmatically — without it, a
    // late boot push could clobber the harness's registration.
    if (state.booted) document.body.dataset.bootSettled = '1';
  }, [state.booted, state.folderPath]);
  // macOS fullscreen toggles the `is-fullscreen` body class so the sidebar
  // can drop its traffic-light drag zone. That's owned entirely by the
  // preload (registered before page load, so it catches the initial state
  // push even when the window starts in fullscreen) — see preload.cjs.
  useEffect(() => {
    const bridge = (window as { electron?: ElectronBridge }).electron;
    return bridge?.onClipboardImage?.((offer) => {
      if (!offer.dataUrl || !offer.mime?.startsWith('image/')) return;
      // If no folder is open yet, keep the offer in renderer memory.
      // Main has already de-duped this hash, so dropping it here would
      // make a screenshot copied just before opening a folder vanish
      // until the user copies it again.
      if (!state.folder) {
        setPendingClipboardOffer(offer);
        return;
      }
      setClipboardOffer(offer);
    });
  }, [state.folder]);
  useEffect(() => {
    if (!state.folder || !pendingClipboardOffer || clipboardOffer) return;
    setClipboardOffer(pendingClipboardOffer);
    setPendingClipboardOffer(null);
  }, [clipboardOffer, pendingClipboardOffer, state.folder]);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data) return;
      const type = typeof e.data.type === 'string' ? e.data.type : '';
      const previewMessage =
        type === 'stashbase-nav' ||
        type === 'stashbase-preview-image' ||
        type === 'stashbase-open-external';
      if (previewMessage && !isTrustedPreviewSource(e.source)) return;
      if (type === 'stashbase-nav') {
        const path = typeof e.data.path === 'string' ? e.data.path : '';
        const anchor = typeof e.data.anchor === 'string' && e.data.anchor ? e.data.anchor : undefined;
        const folder = typeof e.data.folder === 'string' && e.data.folder ? e.data.folder : undefined;
        if (!path) return;
        // `folder` = a link inside an out-of-folder document; the target
        // stays in that member folder (validated server-side on fetch).
        if (folder) void actions.openLibraryFile(folder, path, { anchor });
        else void actions.navigateTo(path, anchor);
        return;
      }
      if (type === 'stashbase-preview-image') {
        const raw = typeof e.data.src === 'string' ? e.data.src : '';
        try {
          const url = new URL(raw, window.location.href);
          if (
            url.protocol === 'http:' ||
            url.protocol === 'https:' ||
            url.protocol === 'data:' ||
            url.protocol === 'blob:'
          ) {
            setPreviewImage({
              src: url.href,
              alt: typeof e.data.alt === 'string' ? e.data.alt : '',
            });
          }
        } catch {
          // Ignore malformed image preview payloads.
        }
        return;
      }
      if (type !== 'stashbase-open-external') return;
      const href = typeof e.data.href === 'string' ? e.data.href : '';
      try {
        const url = new URL(href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
        // Same-origin asset links (e.g. a recording's webm, opened in the
        // system browser to play) need the window's folder context — the
        // browser can't send our header, so carry the windowId in the
        // query the way `assetUrl` does. Without it the server has no open
        // folder for the request and answers NO_FOLDER.
        if (url.origin === window.location.origin && url.pathname.startsWith('/asset/')
          && !url.pathname.startsWith('/asset/__window/')
          && !url.searchParams.has('windowId')) {
          url.searchParams.set('windowId', getWindowId());
        }
        openExternalUrl(url.href);
      } catch {
        // Ignore malformed messages from sandboxed preview content.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [actions]);

  async function handleClipboardAdd(offer: ClipboardOffer) {
    const bridge = (window as { electron?: ElectronBridge }).electron;
    try {
      const file = await dataUrlToFile(offer.dataUrl, offer.filename, offer.mime);
      const saved = await actions.upload([{ file, relPath: file.name }], state.activeFolder);
      if (!saved) return;
      bridge?.markClipboardHandled?.(offer.hash);
      setClipboardOffer(null);
      const suffix = state.activeFolder ? ` to ${state.activeFolder}` : '';
      actions.toast(`Saved ${file.name}${suffix}.`, { level: 'success' });
    } catch (err) {
      console.warn('[clipboard] save failed:', err);
      actions.toast('Could not save the clipboard image.', { level: 'error' });
    }
  }

  return (
    <>
      {/* No dedicated titlebar strip, Cursor-style: the folder identity
       *  lives in `document.title` (the OS titlebar / Mission Control),
       *  and on macOS Electron the traffic lights float over the
       *  sidebar's top drag zone (globals.css). The titlebar band hosts
       *  the shell-level sidebar-toggle + search controls
       *  (TitlebarControls) — they survive a sidebar collapse, so the
       *  toggle is always the way back in; the right edge still drags
       *  to resize/collapse, à la VSCode. */}
      <div
        className={
          'app'
          + (state.sidebarCollapsed ? ' sidebar-collapsed' : '')
          + (state.chatOpen ? ' chat-open' : '')
          + (workspaceLayout === 'chat-primary' ? ' chat-primary' : '')
        }
        style={{
          '--chat-width': `${state.chatWidth}px`,
          '--sidebar-width': `${state.sidebarWidth}px`,
        } as CSSProperties}
      >
        <TitlebarControls />
        <DocumentOutlineProvider>
          <Sidebar />
          <SidebarSplitter />
          <MainPane workspaceHidden={workspaceLayout === 'chat-primary'} />
        </DocumentOutlineProvider>
        {chatMounted && workspaceLayout === 'split' && <ChatSplitter />}
        {chatMounted && (
          <LazyLoadBoundary
            className="chat-pane-shell"
            label="Agent chat"
            resetKey={`${state.activeChatTabId ?? 'none'}:${state.chatOpen ? 'open' : 'closed'}`}
          >
            <Suspense fallback={<aside className="chat-pane-shell" aria-label="Agent chat" />}>
              <LazyChatPane />
            </Suspense>
          </LazyLoadBoundary>
        )}
      </div>
      <DropVeil hot={veilHot} />
      {state.ctxMenu && (
        <LazyLoadBoundary
          className="fixed z-1200 rounded-md bg-popover p-2 text-sm text-popover-foreground shadow-elevation"
          label="context menu"
          resetKey={`${state.ctxMenu.kind}:${state.ctxMenu.target}`}
        >
          <Suspense fallback={null}>
            <LazyContextMenu />
          </Suspense>
        </LazyLoadBoundary>
      )}
      <Hotkeys />
      <QuickOpen />
      <LibrarySearch />
      <EditorHistoryNavigator />
      {previewImage && (
        <LazyLoadBoundary
          className="quick-open-blocking fixed inset-0 z-90 bg-[rgba(18,18,20,0.92)] text-white"
          label="image preview"
          resetKey={previewImage.src}
        >
          <Suspense fallback={<div className="quick-open-blocking fixed inset-0 z-90 grid place-items-center bg-[rgba(18,18,20,0.92)] text-sm text-white/80">Opening image…</div>}>
            <LazyImageLightbox
              src={previewImage.src}
              alt={previewImage.alt}
              onClose={() => setPreviewImage(null)}
            />
          </Suspense>
        </LazyLoadBoundary>
      )}
      {clipboardOffer && state.folder && (
        <ClipboardImportModal
          offer={clipboardOffer}
          onClose={() => {
            const bridge = (window as { electron?: ElectronBridge }).electron;
            bridge?.markClipboardHandled?.(clipboardOffer.hash);
            setClipboardOffer(null);
          }}
          onAdd={() => { void handleClipboardAdd(clipboardOffer); }}
        />
      )}
      <CascadePromptModal />
      <Suspense fallback={null}>
        <LazyUnsupportedFilesModalGate />
      </Suspense>
      <AlertConfirmModal />
      <Toasts />
      <EmbedderRequireKeyGate />
      <SettingsPortal />
    </>
  );
}

function useCompactWorkspace() {
  const [compact, setCompact] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia(COMPACT_WORKSPACE_QUERY).matches
      : window.innerWidth <= 960);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      const onResize = () => setCompact(window.innerWidth <= 960);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const query = window.matchMedia(COMPACT_WORKSPACE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    setCompact(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return compact;
}

/** Decode a `data:` URL into a File. Decodes the base64 (or percent-
 *  encoded) payload directly rather than `fetch(dataUrl)` — the app's CSP
 *  `connect-src 'self'` blocks data: fetches, which made every capture /
 *  clipboard import throw "Could not save". Synchronous; callers `await`
 *  it harmlessly. */
function dataUrlToFile(dataUrl: string, filename: string, mime: string): File {
  const comma = dataUrl.indexOf(',');
  const header = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (header.includes(';base64')) {
    const bin = atob(payload);
    const buf = new ArrayBuffer(bin.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
    return new File([buf], filename, { type: mime });
  }
  // Non-base64 data URL: hand the decoded text straight to File (UTF-8
  // encoded by the Blob constructor).
  return new File([decodeURIComponent(payload)], filename, { type: mime });
}

/** Vertical drag handle on the sidebar's right edge (between the side
 *  panel and the main pane). Drags the panel width within [MIN, MAX];
 *  dragging narrower than COLLAPSE_AT collapses the sidebar entirely
 *  (the titlebar toggle is the visible way back in). Stays mounted
 *  while collapsed (pinned at the window's left edge) so the user can
 *  still grab it and drag the panel back open. Positioned absolutely so
 *  it doesn't perturb the `.app` grid tracks; pointer-capture keeps the
 *  drag alive once the cursor crosses into the main pane. */
function SidebarSplitter() {
  const { state, dispatch } = useApp();
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

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    startRef.current = {
      x: e.clientX,
      w: state.sidebarWidth,
      collapsed: state.sidebarCollapsed,
      done: false,
    };
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
      dispatch({ type: 'SIDEBAR_SET_COLLAPSED', collapsed: true });
      start.done = true;
      return;
    }
    // The reducer clamps to [MIN, MAX]; we snap the floor so the panel
    // doesn't visually dip below MIN before the collapse kicks in.
    dispatch({ type: 'SIDEBAR_WIDTH', width: Math.max(next, SIDEBAR_MIN_WIDTH) });
  }
  function onPointerUp() {
    startRef.current = null;
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
function ChatSplitter() {
  const { state, dispatch } = useApp();
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
