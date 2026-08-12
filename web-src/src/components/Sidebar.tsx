import {
  ChevronDownIcon,
  CollapseAllIcon,
  CubeLogoIcon,
  ExpandAllIcon,
  ExternalLinkIcon,
  FolderIcon,
  HistoryIcon,
  LibraryIcon,
  MoreHorizontalIcon,
  NewFileIcon,
  NewFolderIcon,
  OutlineIcon,
  PlusIcon,
  StarFilledIcon,
  StarIcon,
  SyncIcon,
  TrashIcon,
} from '../icons';
import { SidebarAccountRow } from './SidebarAccountRow';
import { useApp } from '../store/AppContext';
import { makeChatTab, type Action, type LibraryFolderStatus, type State } from '../store/state';
import { folderScope, LIBRARY_SCOPE, newChatPlan, type ChatScope } from './agent/folderState';
import { AGENT_META, AGENTS, type AgentKind } from '../agentCatalog';
import {
  newChatAgentSelectionPlan,
  readPreferredAgent,
  rememberPreferredAgent,
} from '../agentPreference';
import { folderRefsEqual } from '../folderPath';
import { FileTree } from './FileTree';
import { useDocumentOutline } from './DocumentOutlineContext';
import { LazyLoadBoundary, lazyWithRetry } from './ErrorBoundary';
import { libraryListPlan } from './libraryListPlan';
import { Menu, type MenuItem } from './Menu';
import { ModalShell } from './ModalShell';
import { Button } from './ui/button';
import { PopupLoadingStatus } from './ui/status';
import { api, errorMessage, type IndexStatus } from '../api';
import { FILE_MIME } from '../dragMime';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

interface ElectronBridge {
  openFolderDialog?: (opts?: {
    title?: string;
    buttonLabel?: string;
    defaultPath?: string;
    allowCreateDirectory?: boolean;
  }) => Promise<string | null>;
  openFolderWindow?: (folder: string) => Promise<boolean>;
  prepareFolderRemoval?: (folder: string) => Promise<boolean>;
  notifyFolderRemoved?: (folder: string) => Promise<boolean>;
}

const LIBRARY_RECONCILE_COOLDOWN_MS = 30_000;
const OPEN_FOLDER_WATCHDOG_MS = 20_000;

/** The merged session-history popover loads at its interaction boundary
 *  so react-aria (which otherwise ships with the lazy chat chunk) stays
 *  out of the initial renderer bundle. */
const SessionHistoryPopover = lazyWithRetry(() =>
  import('./agent/SessionHistoryMenu').then((mod) => ({ default: mod.SessionHistoryMenu })));

const DocumentOutline = lazyWithRetry(() =>
  import('./DocumentOutline').then((mod) => ({ default: mod.DocumentOutline })));
const SemanticIndexingNotice = lazyWithRetry(() =>
  import('./SemanticIndexingNotice').then((mod) => ({ default: mod.SemanticIndexingNotice })));
const EmbeddingSetupCallout = lazyWithRetry(() => import('./EmbeddingSetupCallout'));
const UnsupportedFilesCallout = lazyWithRetry(() => import('./UnsupportedFilesCallout'));

/** Shorten an absolute path for display: `/Users/foo/Notes` → `~/Notes`
 *  when it lives under the user's home dir. Falls through unchanged
 *  otherwise (e.g. `/tmp/scratch`). */
function prettifyHome(abs: string, home: string): string {
  if (!home) return abs;
  if (abs === home) return '~';
  if (abs.startsWith(home + '/')) return '~/' + abs.slice(home.length + 1);
  return abs;
}

function basenameOfPath(path: string): string {
  const segs = path.split('/').filter(Boolean);
  return segs.pop() || path;
}

/** Collapse a folder's `/api/index-status` payload to the coarse library
 *  readiness state the sidebar cares about. Only `failed` is surfaced (a
 *  subtle warning dot); `preparing`/`unknown` merely keep the poll alive. */
function libraryFolderState(status: IndexStatus): LibraryFolderStatus {
  const hasError = status.indexWarning
    || (status.preparationFailures?.some((problem) => problem.status !== 'cancelled') ?? false);
  const pending = status.pendingCount ?? 0;
  const converting = status.pendingConversions?.length ?? 0;
  const indexReady = status.indexReady !== false;
  const isIndexing = !indexReady
    || status.visibleIndexingSettled === false
    || pending > 0
    || converting > 0;
  return hasError ? 'failed' : isIndexing ? 'preparing' : 'ready';
}

/**
 * The sidebar is one Files panel — the Library folder list + the active
 * folder's file tree — with no activity rail: the sidebar toggle and
 * search live in the shell's titlebar controls (`TitlebarControls.tsx`),
 * search itself in the library search popup (`LibrarySearchDialog.tsx`),
 * and the account (with Settings beside it) in the panel's bottom row.
 */
export function Sidebar() {
  return (
    /* Explicit h-full so the inner file list (flex-1) knows how much to
     * grow into; overflow-hidden clips content as the grid column
     * resizes / collapses to zero width — without it, file names
     * visually spill into the main pane mid-transition.
     * `group/sidebar` drives the hover-reveal of the header action
     * icons (see the side-actions class strings below). */
    <aside className="sidebar group/sidebar relative flex h-full min-h-0 min-w-0 flex-row overflow-hidden border-r border-border bg-pane">
      {/* macOS Electron only (display:none elsewhere): the quiet band at
        * the column's top that the traffic lights float over, doubling as
        * the window drag region now that there is no titlebar strip.
        * Structural rules live in globals.css (Electron chrome
        * exemption) — `-webkit-app-region` needs a real element. */}
      <div className="sidebar-drag-zone" aria-hidden="true" />
      {/* `sidebar-panel` carries the titlebar clearance (globals.css). */}
      <div className="sidebar-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <FilesPanel />
      </div>
    </aside>
  );
}

/* Header action icons stay invisible until the pointer is over the
 * sidebar, mirroring VS Code's quiet explorer toolbar. */
const sideActionsClass =
  'flex gap-0.5 opacity-0 transition-opacity duration-fast group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100';

/* Section header toggle: a quiet, normal-case label whose chevron sits in
 * the same 16px leading slot the pill rows use, so the header text lines
 * up with the row text gutter below it. Rotation lives on the chevron slot
 * (not `[&_svg]` on the button) so other glyphs in the header stay put —
 * callers rotate the slot from the same state that drives aria-expanded. */
const sectionToggleClass =
  'inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left '
  + 'text-muted-foreground hover:text-foreground focus-visible:text-foreground';

/* text-base — the SAME size as the rows: with the app-wide icons beside
 * them, a smaller label reads shrunken rather than subordinate. Regular
 * weight, not medium: these labels sit on their own tinted strip, and
 * that band already says "header" — adding weight on top only made the
 * bottom dock's three lines the heaviest ink in a quiet sidebar. */
const sectionTitleClass = 'min-w-0 truncate text-base text-muted-foreground';

/** The Explorer view. The active folder zone (current folder header +
 * file tree), the LIBRARY resource list, and the active Markdown document
 * outline share this one sidebar as stacked sections. */
function FilesPanel() {
  const { state, activeTab } = useApp();
  const { outline } = useDocumentOutline();
  const [outlineExpanded, setOutlineExpanded] = useState(true);

  const hasMarkdownDocument = activeTab?.file?.format === 'md';
  // Tri-state: `null` means the embedder has not been read yet, and only a
  // definite `false` should pull in the notice chunk. The card re-checks
  // before rendering; this just decides whether loading it can matter.
  const embeddingSetupPossible = state.embedderHasKey === false;
  // The outline block belongs to an OPEN DOCUMENT inside an open
  // folder. A bare workspace (chat only, nothing open) drops it, as
  // does a window with no folder — nothing there has an outline, and
  // the sections below should hold the eye instead.
  const showOutline = !!state.folderPath && !!activeTab?.file;

  // Switching to another document re-applies the outline's default:
  // expanded as soon as it actually HAS headings (they load async, so
  // the switch only marks the intent). A manual fold wins within the
  // current document — the same "transition resets the default" rule as
  // the Library's folder-presence effect. Keyed by file identity so an
  // in-place navigation refreshes the outline for the replacement file.
  const documentKey = hasMarkdownDocument && activeTab?.file
    ? `${activeTab.file.folder ?? ''}:${activeTab.file.name}`
    : null;
  const documentKeyRef = useRef(documentKey);
  const outlineDefaultPending = useRef(false);
  if (documentKeyRef.current !== documentKey) {
    documentKeyRef.current = documentKey;
    outlineDefaultPending.current = documentKey != null;
  }
  const hasHeadings = outline.headings.length > 0;
  useEffect(() => {
    if (outlineDefaultPending.current && hasHeadings) {
      outlineDefaultPending.current = false;
      setOutlineExpanded(true);
    }
  }, [documentKey, hasHeadings]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" id="sidebar-panel-files">
      <NewChatButton />
      {/* Explorer sections mirror VS Code's compact disclosure rows. The
        * folder zones and the active document's outline intentionally share
        * one navigation surface; neither becomes a floating editor
        * companion. */}
      <LibrarySections>
        {/* Shown for as long as SOME document is open (see
          * `showOutline`) — not just Markdown ones — so switching tabs
          * never shifts the sections below under the pointer; a file
          * that cannot have an outline says so in the empty note. It
          * carries the dock's mt-auto anchor; the dock reads outline →
          * Library → account, each a fixed block with a top hairline
          * (they sit flush, so whitespace cannot separate them here).
          * The expanded list is the Library treatment — a capped
          * internal scroller, not a growing section. */}
        {showOutline && (
        <section className="mt-auto flex flex-none flex-col overflow-hidden border-t border-border">
          {/* Same narrow tinted strip as the Library header below. */}
          <div className="group/outline flex min-h-[26px] items-center justify-between gap-1.5 bg-muted/45 pr-2 pl-3.5">
            <button type="button" className={sectionToggleClass} aria-expanded={outlineExpanded} aria-controls="sidebar-outline-section" onClick={() => setOutlineExpanded((expanded) => !expanded)}>
              {/* Same treatment as the Library header: glyph at rest,
                * fold chevron under the pointer. */}
              <span className="inline-flex size-4 flex-none items-center justify-center">
                <OutlineIcon className="size-3.5 group-hover/outline:hidden" />
                <span className={'hidden items-center justify-center transition-transform duration-fast group-hover/outline:inline-flex [&_svg]:size-3.5' + (outlineExpanded ? '' : ' -rotate-90')}><ChevronDownIcon /></span>
              </span>
              <span className={sectionTitleClass + ' flex-1'}>Document Outline</span>
            </button>
          </div>
          {/* FIXED height (VS Code's outline view), not a content cap:
            * an expanded outline is always the same block, so switching
            * between documents with different heading counts never
            * moves the Library rows below. Same 154px as the Library
            * list's cap — the two dock lists read as one rhythm. */}
          <div id="sidebar-outline-section" className={outlineExpanded ? 'flex h-[154px] min-h-0 flex-col overflow-hidden' : 'hidden'}>
            {hasHeadings ? (
              <LazyLoadBoundary
                className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
                label="document outline"
                resetKey={activeTab?.id ?? 'none'}
              >
                <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">Opening outline…</div>}>
                  <DocumentOutline headings={outline.headings} activeId={outline.activeId} onSelect={outline.onSelect} />
                </Suspense>
              </LazyLoadBoundary>
            ) : (
              /* Inline, so a permanently-visible empty block never pulls
                * in the lazy outline chunk — that loads only once a real
                * outline exists. ml-[38px] is the shared label gutter. */
              <p className="my-1 mr-3 ml-[38px] text-sm text-muted-foreground">
                {hasMarkdownDocument ? 'No headings' : 'No outline for this file'}
              </p>
            )}
          </div>
        </section>
        )}
      </LibrarySections>
      {/* AI Index authorization is APP-WIDE, not a property of the
        * open folder, so it sits in the bottom chrome above the account
        * row rather than inside the file tree. Wedged between a folder header
        * and its own files it read as a fact about those files, and it
        * pushed the tree — the thing the panel exists for — down the
        * screen for a secondary notice. */}
      {embeddingSetupPossible && (
        <Suspense fallback={null}>
          <EmbeddingSetupCallout />
        </Suspense>
      )}
      {/* No mt-auto here: a dock block above always carries the bottom
        * anchor, and this row simply sits under it. */}
      <SidebarAccountRow />
    </div>
  );
}

/** Full-width New Chat entry above the Library section (Cursor's "New
 *  Agent" position) — the app's ONE chat-creation entry point, a split
 *  button. The main area starts a chat with the last-selected agent; the
 *  chevron at the row's right edge only chooses the agent the next main-area
 *  click will use. That click reuses the one completely blank tab regardless
 *  of its agent (switching the blank tab's agent in place when it differs —
 *  `newChatPlan`); any content, draft, attachments, or resumed session means
 *  a fresh tab instead. It opens the chat panel when hidden. The
 *  reused/created tab's scope resolves to the window default (current folder,
 *  else Library) on connect, so no scope needs to be threaded here. */
function NewChatButton() {
  const { state, dispatch } = useApp();
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const chevronRef = useRef<HTMLButtonElement | null>(null);

  function startChat(agent: AgentKind) {
    activateChatTabForAgent(state, dispatch, agent);
  }

  /** Picking from the chevron only updates the next-chat preference. Chat
   *  creation stays behind the main New Chat action. */
  function pickAgent(agent: AgentKind) {
    const plan = newChatAgentSelectionPlan(agent);
    rememberPreferredAgent(plan.preferredAgent);
    if (plan.startAgent) startChat(plan.startAgent);
    setMenuAnchor(null);
  }

  /* Agent NAMES, not "New <Agent> Chat": the row itself says New Chat and
   * now names its agent beside this chevron, so the menu is the picker
   * that changes that name — repeating the whole action per item read as
   * three ways to do the same thing. */
  const agentItems: MenuItem[] = AGENTS.map((agent) => ({
    label: agent.launcherLabel,
    icon: <agent.Icon />,
    onSelect: () => pickAgent(agent.id),
  }));

  // Read at render time, no state: the picker closes its menu after writing,
  // while the other rememberPreferredAgent call sites also dispatch a store
  // update, so this row re-renders with the latest app-wide preference.
  const preferred = AGENT_META[readPreferredAgent()];

  return (
    /* A quiet full-width pill row (Cursor's "New Agent" treatment), not a
     * boxed button — the sidebar's rows carry the hierarchy. The chevron
     * is a subtle affordance revealed on hover/focus (and while its menu
     * is open). There is no keyboard shortcut, so no hint is shown. */
    <div className="flex-none px-1.5 pt-2 pb-3">
      <div className="group/newchat flex min-h-7 w-full items-center rounded-md hover:bg-muted">
        <button
          type="button"
          className="flex min-h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-base text-foreground"
          title={`Start a ${preferred.launcherLabel} chat in the current folder, or across the whole library`}
          onClick={() => startChat(readPreferredAgent())}
        >
          {/* A PLUS, not the agent's mark: this row's job is "make a new
            * chat", and leading with a vendor glyph made the action read
            * as "Codex" with a label attached. Which agent it will use
            * now rides beside the chevron, where the picker that changes
            * it lives. 16px slot around the 14px glyph — every row does
            * this, so the label lands on the shared 38px gutter line. */}
          <span className="inline-flex size-4 flex-none items-center justify-center">
            <PlusIcon className="size-3.5 text-muted-foreground" />
          </span>
          <span className="min-w-0 truncate">New Chat</span>
        </button>
        {/* The agent this row will start, named next to its picker — the
          * row would otherwise give no clue which of the two runs, and
          * the menu is where it changes. */}
        {/* No right margin: the chevron's own 20px box already holds the
          * glyph 2px off the text, and any more read as two unrelated
          * controls rather than one label-plus-picker. */}
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {preferred.launcherLabel}
        </span>
        <button
          ref={chevronRef}
          type="button"
          className={
            'mr-1 inline-flex size-5 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent '
            /* bg-active, not bg-muted: this control nests inside a row
             * that already hovers to bg-muted, so its own states need
             * the one-step-darker surface to read. */
            + 'text-muted-foreground hover:bg-active hover:text-foreground focus-visible:opacity-100 '
            /* size-4, a step up from the sidebar's 14px glyphs: this
             * chevron sits beside 11px text rather than 13px row text,
             * so at 14px it read as a speck next to the word it opens. */
            + '[&_svg]:size-4 '
            /* Always visible (muted): the arrow IS the discoverability of
             * the agent menu — hover-only would hide the affordance. */
            + (menuAnchor ? 'bg-active text-foreground' : '')
          }
          aria-label="Choose agent for new chat"
          aria-haspopup="menu"
          aria-expanded={!!menuAnchor}
          onClick={() => {
            if (menuAnchor) { setMenuAnchor(null); return; }
            const rect = chevronRef.current?.getBoundingClientRect();
            if (rect) setMenuAnchor(rect);
          }}
        >
          <ChevronDownIcon />
        </button>
      </div>
      {menuAnchor && (
        <Menu
          anchor={{ rect: menuAnchor, align: 'right' }}
          minWidth={210}
          items={agentItems}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  );
}

/** Ensure the chat panel is open with a tab running `agent` active — the
 *  blank-tab reuse rule shared by New Chat, the History resume path, and
 *  the titlebar chat toggle (its open-with-no-tabs case):
 *  reuse the one COMPLETELY blank tab (switching its agent in place when
 *  it differs), else create a fresh tab; open the panel when hidden. */
export function activateChatTabForAgent(
  state: Pick<State, 'chatTabs' | 'chatOpen'>,
  dispatch: (a: Action) => void,
  agent: AgentKind,
) {
  const plan = newChatPlan(state.chatTabs, agent);
  if (plan.kind === 'reuse') {
    if (plan.switchAgent) dispatch({ type: 'CHAT_TAB_SET_AGENT', id: plan.id, agent });
    dispatch({ type: 'CHAT_TAB_ACTIVATE', id: plan.id });
  } else {
    dispatch({ type: 'CHAT_TAB_NEW', tab: makeChatTab(agent, state.chatTabs) });
  }
  if (!state.chatOpen) dispatch({ type: 'CHAT_TOGGLE' });
}

/** History clock on a sidebar scope header: opens the merged
 *  session-history menu for that scope (both agents' sessions, newest
 *  first). Picking a session records a pending resume in the store and
 *  ensures a suitable chat tab is active (the New Chat blank-tab reuse
 *  rule); that tab's AgentView consumes the request and resumes the
 *  session within this scope. */
function ScopeHistoryButton({
  scope,
  label,
  onOpenChange,
}: {
  scope: ChatScope;
  /** Accessible name + tooltip, e.g. "Chat history in Notes". */
  label: string;
  /** Lets the owning header hold its hover-revealed cluster visible
   *  while the menu is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  function setOpenReported(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  function resumeSession(agent: AgentKind, sessionId: string) {
    setOpenReported(false);
    dispatch({
      type: 'CHAT_RESUME_REQUEST',
      resume: { agent, sessionId, folder: scope.kind === 'folder' ? scope.path : null },
    });
    activateChatTabForAgent(state, dispatch, agent);
  }

  const rect = open ? buttonRef.current?.getBoundingClientRect() : undefined;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground aria-expanded:bg-active aria-expanded:text-foreground"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpenReported(!open)}
      >{/* Explicit size: icon-xs would otherwise render its own 12px
          default, and every sidebar glyph is 14px. */}
        <HistoryIcon className="size-3.5" /></Button>
      {open && (
        <Suspense
          fallback={(
            <PopupLoadingStatus
              label="Opening history…"
              left={rect?.left ?? 0}
              top={(rect?.bottom ?? 0) + 4}
              onCancel={() => setOpenReported(false)}
            />
          )}
        >
          <SessionHistoryPopover
            scope={scope}
            ariaLabel={label}
            triggerRef={buttonRef}
            onClose={() => setOpenReported(false)}
            onResume={resumeSession}
          />
        </Suspense>
      )}
    </>
  );
}

/** `+` in the Library header — a shared menu for both add-folder flows.
 *  "Open Folder…" picks any folder on disk and opens it in place (nothing
 *  is copied; it is indexed where it lives). "New Folder…" opens the same
 *  native picker at the default StashBase home so the OS panel's New
 *  Folder button lands in the expected place. Browser mode (no Electron
 *  bridge) has no portable absolute-path picker, so the button hides. */
function AddFolderMenuButton() {
  const { actions } = useApp();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const bridge = useMemo<ElectronBridge | undefined>(
    () => (window as { electron?: ElectronBridge }).electron,
    [],
  );
  if (typeof bridge?.openFolderDialog !== 'function') return null;

  async function openExistingFolder() {
    try {
      const picked = await bridge!.openFolderDialog!({
        title: 'Select folder',
        buttonLabel: 'Select folder',
        allowCreateDirectory: true,
      });
      if (picked) await actions.openFolder(picked);
    } catch (err) {
      actions.toast('Could not open the folder: ' + errorMessage(err), { level: 'error' });
    }
  }

  async function newFolderFromHome() {
    try {
      const { path } = await api.getFolderHome();
      const picked = await bridge!.openFolderDialog!({
        title: 'Create or select folder',
        buttonLabel: 'Select folder',
        defaultPath: path,
        allowCreateDirectory: true,
      });
      if (picked) await actions.openFolder(picked);
    } catch (err) {
      actions.toast('New folder failed: ' + errorMessage(err), { level: 'error' });
    }
  }

  const items: MenuItem[] = [
    {
      label: 'Open Folder…',
      icon: <FolderIcon />,
      detail: 'Any folder on your disk, indexed in place',
      onSelect: () => { void openExistingFolder(); },
    },
    {
      label: 'New Folder…',
      icon: <NewFolderIcon />,
      detail: 'Created under the StashBase folder home',
      onSelect: () => { void newFolderFromHome(); },
    },
  ];

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground aria-expanded:bg-active aria-expanded:text-foreground"
        title="Add folder to library"
        aria-label="Add folder to library"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={() => {
          if (anchor) { setAnchor(null); return; }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setAnchor(rect);
        }}
      ><PlusIcon className="size-3.5" /></Button>
      {anchor && (
        <Menu
          anchor={{ rect: anchor, align: 'right' }}
          minWidth={210}
          items={items}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

/** The sidebar's two folder zones.
 *
 *  ACTIVE ZONE — only when this window has a folder open: the current
 *  folder's header row (explorer toolbar, drop target, ⋯ menu) with its
 *  file tree beneath. It shares the sidebar's one pane surface — the
 *  inset pill rows, not a surface split, carry the hierarchy.
 *
 *  LIBRARY — every OTHER member folder as a single compact row: favorites
 *  (all of them) pinned first, then the rest in recents order. The list
 *  caps at a fixed height and scrolls internally — a half-row peek at the
 *  cap hints at the overflow. Clicking a row switches this window's folder
 *  in place — the clicked folder moves up into the active zone and the
 *  previous one drops back into the list.
 *
 *  `children` (the Document Outline section) slots BETWEEN the two: it
 *  belongs to the working context above, while Library stays the
 *  bottom-most global section. */
function LibrarySections({ children }: { children?: React.ReactNode }) {
  const { state, actions, dispatch } = useApp();
  // `children` is the Document Outline section (or false when no
  // Markdown document is open) — it decides which bottom block carries
  // the mt-auto anchor.
  const hasOutline = Boolean(children);
  const semanticNoticeVisible = Boolean(
    state.semanticIndexing
    && ['awaiting-decision', 'paused', 'partial-paused'].includes(state.semanticIndexing.state),
  );
  const unsupportedFilesVisible = Boolean(
    (state.unsupportedFiles?.sourceCode ?? 0) + (state.unsupportedFiles?.other ?? 0),
  );
  // Library defaults COLLAPSED while a folder is active (it anchors to
  // the sidebar bottom, out of the way) and expanded when the window has
  // no folder (it IS the main content then). A presence transition
  // resets the default; manual toggles win until the next transition.
  const [libraryExpanded, setLibraryExpanded] = useState(() => !state.folderPath);
  const hadFolderRef = useRef(!!state.folderPath);
  useEffect(() => {
    const hasFolder = !!state.folderPath;
    if (hadFolderRef.current !== hasFolder) {
      hadFolderRef.current = hasFolder;
      setLibraryExpanded(!hasFolder);
    }
  }, [state.folderPath]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // Library-wide chat-history menu open: keeps the header's
  // hover-revealed actions visible while the popover is up.
  const [libraryHistoryOpen, setLibraryHistoryOpen] = useState(false);
  const [folderMenu, setFolderMenu] = useState<{ path: string; name: string; rect: DOMRect } | null>(null);
  // Library row whose History popup is open — keeps that row's
  // hover-revealed action cluster visible while the popup shows.
  const [historyOpenPath, setHistoryOpenPath] = useState<string | null>(null);
  const [folderStates, setFolderStates] = useState<Record<string, LibraryFolderStatus>>({});
  const [openingFolder, setOpeningFolder] = useState<{ path: string; name: string } | null>(null);
  const reconcileStartedAt = useRef<Map<string, number>>(new Map());
  const openingRequestRef = useRef(0);
  const bridge = useMemo<ElectronBridge | undefined>(
    () => (window as { electron?: ElectronBridge }).electron,
    [],
  );

  const isCurrent = useCallback(
    (path: string) => !!state.folderPath && folderRefsEqual(state.folderPath, path),
    [state.folderPath],
  );

  const activePath = state.folderPath;

  // Ordering for the LIBRARY resource list: favorites first, then the rest
  // in recents order; the active folder never appears here (it lives in
  // the active zone above). All rows render — overflow is handled by the
  // list's fixed-height scroll, not disclosure.
  const plan = useMemo(
    () => libraryListPlan(state.recent, activePath),
    [activePath, state.recent],
  );

  // Status polling covers every rendered row (the whole membership —
  // scrolled-out rows included, since scrolling shouldn't change liveness).
  const visibleRowPathsKey = plan.visible.map((entry) => entry.path).join('\n');
  // Background reconcile still covers every non-current member — hidden
  // rows included, because recovery must not depend on what is on screen.
  const otherRootPathsKey = state.recent
    .filter((entry) => !isCurrent(entry.path))
    .map((entry) => entry.path)
    .join('\n');

  // Optimistic star toggle: flip in the store immediately, persist in the
  // background, and re-sync from the server if the write fails.
  const toggleFavorite = useCallback((path: string) => {
    setFolderMenu(null);
    const entry = state.recent.find((r) => r.path === path);
    if (!entry) return;
    const favorite = !entry.favorite;
    dispatch({
      type: 'RECENT_LOADED',
      recent: state.recent.map((r) => (r.path === path ? { ...r, favorite } : r)),
      homeDir: state.homeDir,
    });
    void api.setFolderFavorite(path, favorite).catch((e) => {
      actions.toast(errorMessage(e), { level: 'error' });
      void api.getFolder()
        .then((j) => dispatch({ type: 'RECENT_LOADED', recent: j.recent ?? [], homeDir: j.homeDir }))
        .catch(() => { /* keep the optimistic flip until the next refresh */ });
    });
  }, [actions, dispatch, state.homeDir, state.recent]);

  // Library membership can change without this window acting: an agent's
  // create_project in another window, or an external MCP client. There is
  // no server→renderer membership push, so poll the lightweight
  // /api/folder while the sidebar is visible and adopt the list only when
  // the member set/order actually changed (openedAt churn is ignored —
  // recency labels refresh on the next explicit action).
  const recentKeyRef = useRef('');
  recentKeyRef.current = state.recent.map((r) => r.path).join('\n');
  useEffect(() => {
    if (!libraryExpanded) return undefined;
    let cancelled = false;
    const timer = setInterval(() => {
      void api.getFolder()
        .then((j) => {
          if (cancelled) return;
          const recent = j.recent ?? [];
          const key = recent.map((r) => r.path).join('\n');
          if (key !== recentKeyRef.current) {
            dispatch({ type: 'RECENT_LOADED', recent, homeDir: j.homeDir });
          }
        })
        .catch(() => { /* transient; next tick retries */ });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dispatch, libraryExpanded]);

  const removeFolder = useCallback((path: string) => {
    setRemoving(true);
    void (async () => {
      if (bridge?.prepareFolderRemoval) {
        const ready = await bridge.prepareFolderRemoval(path);
        if (!ready) {
          throw new Error('Another window could not save its current edit. The folder was not removed.');
        }
      }
      await api.removeFolder(path);
      await bridge?.notifyFolderRemoved?.(path);
      dispatch({ type: 'LIBRARY_FOLDER_STATUS_REMOVE', path });
      const j = await api.getFolder();
      dispatch({ type: 'RECENT_LOADED', recent: j.recent ?? [], homeDir: j.homeDir });
    })()
      .catch((e) => actions.toast(errorMessage(e), { level: 'error' }))
      .finally(() => { setRemoving(false); setConfirmRemove(null); });
  }, [actions, bridge, dispatch]);

  const openRoot = useCallback((path: string) => {
    if (isCurrent(path)) return;
    const requestId = ++openingRequestRef.current;
    setFolderMenu(null);
    setOpeningFolder({ path, name: basenameOfPath(path) });
    void actions.openFolder(path)
      .catch((e) => {
        if (requestId !== openingRequestRef.current) return;
        const msg = errorMessage(e);
        actions.toast(msg, { level: 'error' });
        // Remove the failed entry immediately so a stale/deleted path
        // doesn't remain clickable if the server refresh also fails.
        dispatch({
          type: 'RECENT_LOADED',
          recent: state.recent.filter((r) => r.path !== path),
          homeDir: state.homeDir,
        });
        void api.getFolder()
          .then((j) => dispatch({ type: 'RECENT_LOADED', recent: j.recent ?? [], homeDir: j.homeDir }))
          .catch(() => { /* keep the optimistic removal */ });
      })
      .finally(() => {
        if (requestId === openingRequestRef.current) setOpeningFolder(null);
      });
  }, [actions, dispatch, isCurrent, state.homeDir, state.recent]);

  const openRootInNewWindow = useCallback(async (path: string) => {
    setFolderMenu(null);
    const opened = await bridge?.openFolderWindow?.(path);
    if (!opened) {
      actions.toast('New window is only available in the desktop app.', { level: 'error' });
    }
  }, [actions, bridge]);

  // Watchdog: a folder open that neither resolves nor rejects should not
  // leave the row stuck in its busy state forever.
  useEffect(() => {
    if (!openingFolder) return undefined;
    const opening = openingFolder;
    const timer = setTimeout(() => {
      setOpeningFolder(null);
      actions.toast(
        `Opening ${opening.name} is taking longer than expected. Please try again.`,
        { level: 'error' },
      );
    }, OPEN_FOLDER_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [actions, openingFolder]);

  // Poll the visible list rows' index status while the list is shown so
  // they can carry a quiet needs-attention dot. The current folder's
  // readiness is owned by the in-folder surfaces (tree markers, Search
  // view), which can point at the affected files.
  useEffect(() => {
    const paths = visibleRowPathsKey ? visibleRowPathsKey.split('\n') : [];
    if (!libraryExpanded || openingFolder || paths.length === 0) {
      setFolderStates({});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function refreshFolderStates() {
      const entries = await Promise.all(paths.map(async (path) => {
        try {
          const status = await api.indexStatus(path);
          return [path, libraryFolderState(status)] as const;
        } catch {
          return [path, state.libraryFolderStatuses[path] ?? 'unknown'] as const;
        }
      }));
      if (cancelled) return;
      const fresh = Object.fromEntries(entries) as Record<string, LibraryFolderStatus>;
      setFolderStates(fresh);
      const keepPolling = Object.values(fresh).some((s) => s === 'preparing' || s === 'unknown');
      if (keepPolling) timer = setTimeout(refreshFolderStates, 1500);
    }
    timer = setTimeout(refreshFolderStates, 750);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [libraryExpanded, openingFolder, state.libraryFolderStatuses, visibleRowPathsKey]);

  // Background reconcile for the non-current library folders, with a
  // per-folder cooldown: previous library work (conversions, indexing)
  // may still be incomplete, and status polling alone is not recovery.
  useEffect(() => {
    const paths = otherRootPathsKey ? otherRootPathsKey.split('\n') : [];
    if (!libraryExpanded || openingFolder || paths.length === 0) return undefined;
    const timer = setTimeout(() => {
      const now = Date.now();
      for (const path of paths) {
        const lastStarted = reconcileStartedAt.current.get(path) ?? 0;
        if (now - lastStarted < LIBRARY_RECONCILE_COOLDOWN_MS) continue;
        reconcileStartedAt.current.set(path, now);
        void api.sync(path)
          .catch((err) => {
            console.warn(`[library] reconcile failed for ${path}:`, err);
          });
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [libraryExpanded, openingFolder, otherRootPathsKey]);

  const removeTarget = confirmRemove
    ? (() => {
        const segs = confirmRemove.split('/').filter(Boolean);
        const name = segs.pop() || confirmRemove;
        const parent = prettifyHome(segs.length ? '/' + segs.join('/') : '/', state.homeDir ?? '');
        return { path: confirmRemove, name, parent };
      })()
    : null;

  const menuEntry = folderMenu ? state.recent.find((r) => r.path === folderMenu.path) : null;
  const activeName = activePath ? basenameOfPath(activePath) : '';
  const activeFavorite = !!activePath
    && !!state.recent.find((r) => folderRefsEqual(r.path, activePath))?.favorite;
  const showZeroState = !activePath && state.recent.length === 0;

  return (
    <>
      {activePath && (
        /* ACTIVE ZONE — the window's current folder. It takes ALL the
         * room the bottom dock leaves (flex-1) and scrolls the tree
         * internally; a content-height cap would strand blank space
         * between the tree and the dock. Same quiet pane surface as the
         * rest of the sidebar — the pill rows carry the hierarchy, so no
         * hairline or surface split. */
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ActiveFolderHeader
            name={activeName}
            path={activePath}
            favorite={activeFavorite}
            menuOpen={folderMenu?.path === activePath}
            onMenu={(rect) => setFolderMenu({ path: activePath, name: activeName, rect })}
          />
          {/* Collapsing hides the list but leaves the `expanded` set in
            * state untouched, so re-expanding restores every inner
            * folder's prior open/closed state. */}
          {!state.folderCollapsed && (
            <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
              {semanticNoticeVisible && (
                <Suspense fallback={null}>
                  <SemanticIndexingNotice />
                </Suspense>
              )}
              {unsupportedFilesVisible && (
                <Suspense fallback={null}>
                  <UnsupportedFilesCallout />
                </Suspense>
              )}
              <FileTree />
            </div>
          )}
        </section>
      )}
      {children}
      {/* LIBRARY sizes to its content too, shrinking (with an internal
        * scroll) only when the panel runs out of room — leftover blank
        * space falls below the last section, never between sections. */}
      {/* The Library lives in the sidebar's BOTTOM group — its position
        * is fixed regardless of folder state, so opening a folder never
        * makes the section jump. The mt-auto anchor sits on the FIRST
        * block of that group: the Document Outline when one is shown,
        * else here (two auto margins would split the free space). Only
        * the default fold state changes: expanded in a no-folder window
        * (it is the main content then), collapsed once a folder is
        * active (see the presence-transition effect above). */}
      {/* No bottom padding on the dock blocks: the next block's hairline
        * separates — padding above a hairline reads as a white seam. */}
      <section className={(hasOutline ? '' : 'mt-auto ') + 'flex min-h-0 flex-col overflow-hidden border-t border-border ' + (libraryExpanded ? 'flex-initial' : 'flex-none')}>
        {/* VS Code-style narrow tinted strip: shorter than the 28px
          * rows, quiet bg tint, full-bleed. Action buttons run icon-xs
          * (24px) so the strip can stay 26px. */}
        <div className="group/lib flex min-h-[26px] flex-none items-center gap-1.5 bg-muted/45 pr-2 pl-3.5">
          <button
            type="button"
            className={sectionToggleClass + ' flex-none'}
            aria-expanded={libraryExpanded}
            aria-controls="sidebar-files-section"
            onClick={() => setLibraryExpanded((expanded) => !expanded)}
          >
            {/* Same treatment as the active-folder header: the Library
              * glyph at rest, the fold chevron under the pointer — both
              * at the app-wide 14px, inside the 16px grid slot. */}
            <span className="inline-flex size-4 flex-none items-center justify-center">
              <LibraryIcon className="size-3.5 group-hover/lib:hidden" />
              <span className={'hidden items-center justify-center transition-transform duration-fast group-hover/lib:inline-flex [&_svg]:size-3.5' + (libraryExpanded ? '' : ' -rotate-90')}><ChevronDownIcon /></span>
            </span>
            <span className={sectionTitleClass}>Library</span>
          </button>
          <div className={(libraryHistoryOpen ? 'flex gap-0.5' : sideActionsClass) + ' ml-auto'}>
            {/* Library-scoped chat sessions — covers library chats even in
              * a no-folder window (which has no active-folder header). */}
            <ScopeHistoryButton
              scope={LIBRARY_SCOPE}
              label="Library chat history"
              onOpenChange={setLibraryHistoryOpen}
            />
            <AddFolderMenuButton />
          </div>
        </div>
        <div id="sidebar-files-section" className={libraryExpanded ? 'flex min-h-0 flex-col overflow-hidden' : 'hidden'}>
          {showZeroState ? <ZeroFolderState /> : (
            /* One height in BOTH states: up to five 28px rows plus a
             * half-row peek — the peek is the scroll affordance (macOS
             * scrollbars stay hidden until the user scrolls); shorter
             * memberships size to content. Letting the no-folder window
             * grow the list instead made the same section change size
             * when a folder opened, so the dock moved under the pointer
             * exactly when the user was aiming at it. */
            <div className="scrollbar-quiet max-h-[154px] min-h-0 flex-[1_1_auto] overflow-y-auto px-1.5">
              {plan.visible.map((entry) => {
                const name = basenameOfPath(entry.path);
                const opening = openingFolder?.path === entry.path;
                const needsAttention = folderStates[entry.path] === 'failed';
                const menuOpen = folderMenu?.path === entry.path;
                return (
                  <div
                    key={entry.path}
                    className={`group/root relative flex min-h-7 items-center rounded-md pr-0.5 ${
                      menuOpen ? 'bg-muted' : 'hover:bg-muted'
                    }${opening ? ' opacity-60' : ''}`}
                  >
                    <button
                      type="button"
                      aria-label={name}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent py-1 pr-1 pl-2 text-left text-base text-foreground/80 group-hover/root:text-foreground disabled:cursor-default"
                      disabled={!!openingFolder}
                      title={entry.path}
                      onClick={() => openRoot(entry.path)}
                    >
                      {/* Leading 16px slot: muted folder glyph (spinner while
                        * opening); favorites carry a small star overlay at the
                        * glyph's corner instead of a second leading icon.
                        * Glyphs at the app-wide 14px inside the 16px slot,
                        * matching the file tree rows. */}
                      <span className="relative inline-flex size-4 flex-none items-center justify-center text-muted-foreground">
                        {opening
                          ? <SyncIcon className="size-3.5 animate-spin" />
                          : <FolderIcon className="size-3.5" />}
                        {!opening && entry.favorite && (
                          <StarFilledIcon className="absolute -right-1 -bottom-0.5 size-2" aria-label="Favorite" />
                        )}
                      </span>
                      <span className="min-w-0 truncate">{name}</span>
                      {needsAttention && (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-status-warning"
                          role="img"
                          aria-label="Search needs attention"
                          title="Some files in this folder could not be prepared for search."
                        />
                      )}
                    </button>
                    <span
                      /* Same geometry as the Library header's cluster:
                       * icon-xs (24px) buttons, gap-0.5, and an 8px
                       * effective right inset (container px-1.5 + row
                       * pr-0.5 = the header's pr-2) — all three must
                       * match or the clock lands in a different column
                       * per row. Change one side, change both. */
                      className={`flex items-center gap-0.5 ${
                        menuOpen || historyOpenPath === entry.path ? '' : 'opacity-0 transition-opacity duration-fast group-focus-within/root:opacity-100 group-hover/root:opacity-100'
                      }`}
                    >
                      {/* Every scope carries its own History entry (the
                        * same affordance as the Library header's clock). */}
                      <ScopeHistoryButton
                        scope={folderScope(entry.path)}
                        label={`Chat history in ${name}`}
                        onOpenChange={(open) => setHistoryOpenPath(open ? entry.path : null)}
                      />
                      <RootMenuButton
                        name={name}
                        menuOpen={menuOpen}
                        onMenu={(rect) => setFolderMenu({ path: entry.path, name, rect })}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      {folderMenu && (
        <Menu
          anchor={{ rect: folderMenu.rect, align: 'right' }}
          minWidth={210}
          items={[
            // The window's current folder folds its low-frequency
            // maintenance actions in here — the header row only keeps
            // new-note, history, and this menu visible, so the folder
            // name keeps its room.
            ...(isCurrent(folderMenu.path) ? [
              {
                label: 'New Folder…',
                icon: <NewFolderIcon />,
                onSelect: () => {
                  if (state.activeFolder) dispatch({ type: 'EXPAND_FOLDER', path: state.activeFolder });
                  dispatch({ type: 'NEW_FOLDER_INPUT', open: true });
                },
              },
              {
                label: 'Sync Folder',
                icon: <SyncIcon />,
                detail: 'Re-scan disk for external changes',
                onSelect: () => { void actions.runSync(); },
              },
              state.expanded.size === 0
                ? {
                    label: 'Expand All Folders',
                    icon: <ExpandAllIcon />,
                    onSelect: () => dispatch({ type: 'EXPAND_ALL_FOLDERS', paths: state.folders.map((f) => f.path) }),
                  }
                : {
                    label: 'Collapse All Folders',
                    icon: <CollapseAllIcon />,
                    onSelect: () => dispatch({ type: 'COLLAPSE_ALL_FOLDERS' }),
                  },
              { separator: true },
            ] satisfies MenuItem[] : []),
            {
              label: menuEntry?.favorite ? 'Remove from Favorites' : 'Add to Favorites',
              icon: <StarIcon />,
              onSelect: () => toggleFavorite(folderMenu.path),
            },
            ...(bridge?.openFolderWindow ? [{
              label: 'Open in New Window',
              icon: <ExternalLinkIcon />,
              onSelect: () => { void openRootInNewWindow(folderMenu.path); },
            } satisfies MenuItem] : []),
            { separator: true },
            {
              label: 'Remove from Library',
              icon: <TrashIcon />,
              detail: 'Will not delete local files',
              danger: true,
              onSelect: () => setConfirmRemove(folderMenu.path),
            },
          ] satisfies MenuItem[]}
          onClose={() => setFolderMenu(null)}
        />
      )}
      {removeTarget && (
        <ModalShell
          title="Remove from Library?"
          description={
            <>
            StashBase will remove <strong className="font-semibold text-accent">{removeTarget.name}</strong> from your Library.
            It will <strong>not</strong> delete the folder or its files from your disk.
            </>
          }
          onCancel={removing ? () => { /* wait for removal */ } : () => setConfirmRemove(null)}
          top
        >
          <div className="mt-2 truncate text-sm text-muted-foreground" title={removeTarget.path}>
            {removeTarget.parent}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={removing}
              onClick={() => setConfirmRemove(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={() => removeFolder(removeTarget.path)}
            >
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

/** The ⋯ trigger shared by every folder row. */
function RootMenuButton({
  name,
  menuOpen,
  onMenu,
}: {
  name: string;
  menuOpen: boolean;
  onMenu: (rect: DOMRect) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-muted-foreground aria-expanded:bg-active aria-expanded:text-foreground"
      aria-label={`More actions for ${name}`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={(e) => {
        e.stopPropagation();
        onMenu(e.currentTarget.getBoundingClientRect());
      }}
    >
      <MoreHorizontalIcon className="size-3.5" />
    </Button>
  );
}

/** The active zone's header row — the window's current folder. Carries the
 *  classic explorer toolbar (new note / new folder / sync / fold) plus the
 *  same ⋯ folder menu as the library rows. The `#sideHead` id and
 *  `drop-target` state class stay CSS-driven: `useGlobalDragDrop` toggles
 *  `drop-target` imperatively on #sideHead, sharing the tree's exempted
 *  drop styling (see sidebar.css). The header carries no persistent
 *  selected surface — its position above the tree already marks it as the
 *  current folder. */
function ActiveFolderHeader({
  name,
  path,
  favorite,
  menuOpen,
  onMenu,
}: {
  name: string;
  path: string;
  favorite: boolean;
  menuOpen: boolean;
  onMenu: (rect: DOMRect) => void;
}) {
  const { state, actions, dispatch } = useApp();
  const [sideHeadDrop, setSideHeadDrop] = useState(false);
  // Chat-history menu open: hold the hover-revealed action cluster
  // visible while its popover (portalled outside the sidebar) is up.
  const [historyOpen, setHistoryOpen] = useState(false);

  function onSideHeadDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(FILE_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    setSideHeadDrop(true);
  }
  function onSideHeadDragLeave() { setSideHeadDrop(false); }
  function onSideHeadDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setSideHeadDrop(false);
    const internal = e.dataTransfer.getData(FILE_MIME);
    if (internal) {
      void actions.moveFile(internal, '');
    }
    // External imports are handled by the global drop listener which
    // computes its target from the cursor's `.tree-row.folder` /
    // `#sideHead` closest. We don't double-handle here.
  }

  return (
    <div
      id="sideHead"
      className={
        /* pr-0.5 (not pr-1): with the row's mx-1.5 that lands the action
         * cluster on the same 8px right inset as the Library header and
         * its rows, so every action icon in the sidebar shares one
         * column. */
        'side-head group/head mx-1.5 flex min-h-7 flex-none items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 hover:bg-muted'
        + (sideHeadDrop ? ' drop-target' : '')
      }
      onDragOver={onSideHeadDragOver}
      onDragLeave={onSideHeadDragLeave}
      onDrop={onSideHeadDrop}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-foreground">
        {/* Folder glyph at rest; the pointer swaps in the fold chevron so
          * the collapse affordance appears only when it's actionable. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-4 flex-none rounded-sm p-0 text-muted-foreground hover:bg-transparent"
          aria-label={`${state.folderCollapsed ? 'Expand' : 'Collapse'} files in ${name}`}
          aria-expanded={!state.folderCollapsed}
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'FOLDER_FOLD_TOGGLE' }); }}
        >
          <FolderIcon className="size-3.5 group-hover/head:hidden" />
          <span className={'hidden items-center justify-center transition-transform duration-fast group-hover/head:inline-flex [&_svg]:size-3.5' + (state.folderCollapsed ? ' -rotate-90' : '')}><ChevronDownIcon /></span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-w-0 flex-1 shrink justify-start truncate p-0 text-left text-base font-medium text-foreground hover:bg-transparent hover:text-foreground active:translate-y-0"
          aria-label={`Select ${name} folder root`}
          title={path}
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ACTIVE_FOLDER', path: '' }); }}
        >{name}</Button>
        {favorite && (
          <StarIcon className="size-3 shrink-0 fill-current text-muted-foreground" aria-label="Favorite" />
        )}
      </span>
      {/* Only the high-frequency actions stay on the row — new note,
        * history, and the ⋯ menu (which carries new-folder / sync /
        * fold-all for this folder). Six icons here crushed the name. */}
      <div className={menuOpen || historyOpen ? 'flex gap-0.5' : sideActionsClass}>
        <NewNoteButton />
        {/* This folder's chat sessions — history lives on the scope
          * headers, not in the chat pane. */}
        <ScopeHistoryButton
          scope={folderScope(path)}
          label={'Chat history in ' + name}
          onOpenChange={setHistoryOpen}
        />
        <RootMenuButton name={name} menuOpen={menuOpen} onMenu={onMenu} />
      </div>
    </div>
  );
}

/** Zero-folder library: the one place sidebar chrome is allowed a small
 *  brand-warmth moment (see visual-style's warmth budget) — the app mark,
 *  a single line of guidance, and the primary add-folder action. */
function ZeroFolderState() {
  const { actions } = useApp();
  const bridge = useMemo<ElectronBridge | undefined>(
    () => (window as { electron?: ElectronBridge }).electron,
    [],
  );

  async function addFolder() {
    try {
      const picked = await bridge!.openFolderDialog!({
        title: 'Select folder',
        buttonLabel: 'Select folder',
        allowCreateDirectory: true,
      });
      if (picked) await actions.openFolder(picked);
    } catch (err) {
      actions.toast('Could not open the folder: ' + errorMessage(err), { level: 'error' });
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 px-4 pt-5 pb-4">
      <div className="size-9 *:size-full"><CubeLogoIcon /></div>
      <p className="m-0 text-sm leading-snug text-muted-foreground">
        Add a folder to build your searchable library.
      </p>
      {typeof bridge?.openFolderDialog === 'function' && (
        <Button onClick={() => { void addFolder(); }}>Add Folder…</Button>
      )}
    </div>
  );
}

/** "+" icon in the sidebar header that creates a new Markdown note in
 *  the active folder. HTML notes were dropped once their editor went
 *  away, so there's no format picker — one click, one .md draft. */
function NewNoteButton() {
  const { state, actions } = useApp();
  const target = state.activeFolder || state.folder || 'folder root';

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground"
      title={'New note in ' + target}
      aria-label={'New note in ' + target}
      onClick={() => void actions.newNote()}
    ><NewFileIcon className="size-3.5" /></Button>
  );
}
