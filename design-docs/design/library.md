# Local File Workspace

StashBase is a workspace for ordinary local folders. It should make existing
files easier to work with and easier to hand to an Agent without asking users
to migrate them into a StashBase-specific storage model.

## Current

- Users can add, create, open, and remove local folders from the library.
- The app has no landing page: a window boots straight into the workspace
  with no folder selected, showing the chat panel on one blank
  library-scoped chat (the New Chat default). Browsing a folder is always
  an explicit sidebar click; only an explicit open request (such as Open
  in New Window) or a same-window reload restores a folder. An empty
  library shows a small zero-folder block in the sidebar with the app
  mark, one line of guidance, and an Add Folder action.
- The sidebar folder list refreshes itself while visible (a lightweight
  membership poll), so a project created by an agent in another window or
  by an external MCP client appears without any user action.
- A full-width New Chat split button sits at the top of the sidebar,
  above the Library section — the app's one chat-creation entry point.
  It leads with a `+`, not an Agent mark: the row's job is starting a
  chat, and which Agent that will be is named at the row's right edge,
  beside the chevron that changes it. Its main area starts a chat with
  the last-selected Agent; the chevron chooses Claude Code or Codex as
  the new default without starting a chat. The
  chat is scoped to the window's current folder, or to the whole library
  when no folder is current, and a completely blank chat is reused
  (switching its Agent in place when needed) instead of stacking empty
  tabs. New Chat also reopens a hidden chat panel.
- The sidebar splits folder navigation into two zones separated by a
  hairline and a surface shift. When a folder is open, an active zone under
  the New Chat button shows that folder's header row (explorer toolbar
  with a chat-history action for that folder's sessions, drop target,
  ⋯ menu) with its file tree beneath, on the base surface.
  Below it, the Library section lists every other member folder as a single
  compact row on the pane surface — favorites (all of them) pinned first,
  then the rest in recents order. The Library section's position is fixed:
  it always anchors to the sidebar bottom (above the account row), so
  opening a folder never makes it jump, and the expanded list keeps one
  height whether or not a folder is open — about five rows, with a
  half-row peek hinting at the overflow, scrolling internally past that.
  Only its default fold state changes: expanded in a window with no
  folder, collapsed once a folder becomes active. Clicking a row
  switches this window's folder in place: the clicked folder moves up into
  the active zone and the previous one drops back into the list. Switching
  resets the folder-scoped document tabs, but keeps the search popup's
  remembered query and results (search is library-scoped) and keeps the
  window's chat tabs and their running Agent sessions — each chat is pinned
  to its own scope (a library folder, or the whole library) — and surfaces
  a welcome chat for the new folder without disturbing any started chat or
  unsent draft. Visible library rows show a subtle warning dot when files
  in that folder could not be prepared for search.
- A `+` button in the Library header offers Open Folder… (any folder on
  disk, indexed in place) and New Folder… (created under the default
  StashBase location) through the native picker; a folder row's actions
  menu offers favorite toggling, Open in New Window, and Remove from
  Library. The current folder's header row keeps only its high-frequency
  actions visible on hover — new note, chat history, and the ⋯ menu; that
  menu additionally carries the folder's maintenance actions (New
  Folder…, Sync Folder, Collapse/Expand All) above the shared entries.
  Users can star folders as Favorites; favorites are library
  metadata stored with the membership list, and starring never touches
  the folder on disk. New Folder creates a plain directory with no chat
  association.
- Beside that `+`, the Library header carries a chat-history action for
  library-wide sessions — so past library chats stay reachable even with
  no folder selected. The active folder's header carries the same action
  for that folder's sessions; both list each Agent's chats together and
  reopen a picked session in the chat panel (see
  [Agent Panel](agent-panel.md)).
- The built-in Agent can also add a project: `create_project` (an MCP tool)
  creates a folder — under the default StashBase location unless the user
  names a valid location inside the folder home or a library folder — and
  registers it into the library, so it appears in every window's sidebar
  list immediately. Only the window owning the calling chat switches its
  browse location to the new project; and only a library-scoped chat moves
  its own binding there (see [Agent Panel](agent-panel.md)).
- Each window centres on one current folder, with its own file tree, document
  tabs, search popup, and Agent panel. The search popup's remembered state is
  window-local but not folder-scoped.
- Users can open multiple windows from the application menu or a folder action
  to keep different folders or working contexts visible side by side. A folder
  action focuses an existing matching window when one is already available.
- Window keyboard behavior follows VS Code: Cmd/Ctrl+Shift+N opens a window;
  macOS uses Cmd+Shift+W to close one, while Windows and Linux use Alt+F4 with
  Ctrl+Shift+W as an alternative. Cmd/Ctrl+W remains the active-tab command.
- Users can create, rename, move, and delete files or folders through explicit
  file operations.
- A folder opens into a chat-first workspace with the Files sidebar still
  visible. Selecting or creating a document reveals the source pane and docks
  the same conversation beside it.
- The main pane opens the source file the user selected; generated artifacts
  stay hidden.
- JSON files are visible structured-data sources. They open as raw,
  syntax-highlighted text in a read-only view with an explicit edit action;
  malformed JSON remains openable and editable, and saving preserves source
  text instead of formatting or serializing it.
- Dot-prefixed directories (`.claude`, `.git`, `.obsidian`, …) are tool
  internals, not knowledge: the file tree, search, and the index skip them.
  Agent-contract files (`AGENTS.md`, `CLAUDE.md`) are ordinary visible
  Markdown, and agents can still read and write dot-directory config
  directly.
- A sidebar click opens the file in its own persistent tab; an already-open
  file is focused rather than reopened. There is no preview/pinned tab split —
  one click always opens a lasting tab.
- PDF tabs retain their active reading position (page number) across tab switches during a session. Opening a different file in a tab resets the stored page position.
- A PDF opens fitted to the pane width — edge to edge, with no side margin,
  and none above it either; zoom away from fit and the page takes the same
  margin above it that it takes between pages. Its reading controls sit in
  one quiet row at the top of the pane: zoom,
  the current zoom level (click it for actual size), a Fit toggle that stays
  pressed while auto-fit holds, and the current page over the total, which is
  also the jump-to-page field. Page position lives there rather than beside
  each page, since a fitted page leaves no margin to put it in.
- Cmd/Ctrl+T opens a new blank tab, the keyboard equivalent of the tab
  strip's `+` button — distinct from Cmd/Ctrl+N, which creates a note file.
- Cmd/Ctrl+O opens a focused Quick Open for visible source files in the active
  folder. It starts with recently used editors, then ranks basename and
  relative-path matches; accepting a result retains normal unsaved-work
  protections. Typing `>` switches that same picker to safe app
  commands; Cmd/Ctrl+Shift+P and F1 open that command mode directly.
- Holding Ctrl and tapping Tab opens Editor History, a VS Code-style
  Alt-Tab switcher over open tabs ordered by most-recent use, independent of
  tab-strip order. A quick tap-release switches straight to the previous
  editor without ever showing the picker; only a deliberate hold (or a
  second Tab tap) reveals it. Once revealed, tapping Tab while Ctrl stays
  down cycles the highlighted entry (Shift reverses); releasing Ctrl
  activates it. Escape cancels. Deliberately the literal Control key on
  every platform, including macOS, since Cmd+Tab is the OS application
  switcher.
- Search results and agent file links return users to those source files.
  A target in another library folder opens as a read-only out-of-folder tab
  without switching this window's folder; its banner names the folder and
  offers Open Folder in New Window for full editing there. Out-of-folder
  tabs stay outside the tree's selection, Quick Open recents, and the
  folder-listing tab pruning.
- Root-level `AGENTS.md` and optional `CLAUDE.md` bridge files are visible,
  editable user files. StashBase only creates missing defaults.
- Opening a folder starts changed-content indexing checks in the background.
  When the pending AI Index workload is unusually large, a persistent,
  non-blocking notice lets the user build it or leave it paused for that folder.

## Experience Contract

- Opening a folder should feel like navigation, not a long preparation task.
- Deferring AI Index must not block browsing, editing, preparation, or exact
  text search, and the decision must remain recoverable after restart.
- Opening or closing one window must not switch or close another window's
  folder context.
- Window lifecycle shortcuts must not be interpreted as document-tab commands.
- Closing a window must either save the live edit first or leave the window
  open with a visible save failure.
- Opening a folder from one window must not create an avoidable duplicate when
  another window already owns that context.
- Users must be able to tell whether an operation affects source files or only
  StashBase-owned state.
- Removing a library folder removes derived state, never the user's folder.
- Removing a folder that is open elsewhere saves those windows and returns
  them to the no-folder workspace (the sidebar library list) instead of
  leaving stale editable state behind.
- Destructive file operations require clear confirmation.
- Blocking dialogs and menus keep keyboard focus inside the active surface,
  dismiss only the topmost eligible surface with Escape, and return focus to
  the invoking control. Pointer context menus first focus their file-tree row,
  so dismissal has the same deterministic return target. Non-blocking feedback
  is announced without stealing focus.
- Sidebar and Agent-panel widths work with pointer input and with
  Arrow/Home/End keys on macOS, Windows, and Linux; reduced-motion users do
  not receive layout movement animation.
- Closing the last document lets an open Chat reclaim the main area. Hiding
  Chat is explicit and stays hidden; the titlebar's chat toggle (top-right,
  mirroring the sidebar toggle) or the sidebar's New Chat button is the way
  back in.
- The Files sidebar is a calm orientation tool, not a separate knowledge graph
  or project-management surface. The active folder zone (current folder
  header and file tree) fills all the room the bottom group leaves; that
  group holds the document outline, then the Library folder list, then the
  account row. The outline section belongs to an open document: it appears
  whenever one is open in a folder — whatever its format, so switching tabs
  never shifts the sections below — and states plainly when the document has
  no headings or cannot have an outline. An expanded outline holds a fixed
  height for the same reason, and defaults to expanded whenever a newly
  opened document has headings. A bare workspace, or a window with no
  folder, drops the outline entirely and leaves the Library to hold the eye.
  The Library and outline sections stay independently collapsible, each an
  internal scroller under a compact section header. There is no activity
  rail: the
  sidebar toggle and Search live as shell controls in the titlebar band at
  the window's top-left (they stay put when the sidebar is collapsed, so
  the toggle is always the way back in). The sidebar's bottom row is a
  quiet identity strip: an avatar chip and the account name on the left,
  and on the right a utility cluster of the community Discord, Report a bug
  (a disabled placeholder until the report flow ships), and Settings at the
  far-right edge. Settings is an icon there rather than a labelled row; it
  keeps a tooltip and its Command Palette entry instead of hiding inside an
  identity menu. Reaching a human is the app's
  only escape hatch when something is wrong, so the Discord link stays in
  persistent chrome instead of behind a menu — and stays on the strip's
  muted neutral, because a brand-coloured control that is always on screen
  would outrank the user's own files.
- Nobody has to sign in. Until an account exists the identity strip reads
  **Anonymous**, which is a finished state and is presented as one: the row
  is static and carries no sign-in button, badge, dot, or index-readiness
  marker. Its label has lower contrast than navigation labels, keeping
  identity available without competing with the Library hierarchy. AI Index
  setup and source management stay in their existing
  callout and Settings surfaces; the identity strip does not repeat them in
  an account menu before a real account action exists. The utility actions
  on the row use a slightly larger optical size than dense list actions so
  Settings and help remain clear without loosening the surrounding sidebar.
- StashBase displays only supported document, structured-data, and media formats in the Files panel. Unsupported files are classified into source-code/project files and other unsupported formats. Dot-prefixed files (`.DS_Store`, tool configs) are invisible infrastructure: never listed and never counted as unsupported, and a folder holding only dot-files reads as physically empty. Folders that contain only unsupported files are pruned from the directory tree to keep navigation clean, while physically empty folders and folders with supported files remain visible. Users are notified of hidden unsupported files via a first-time onboarding explanation modal and a dismissable callout card in the Files panel — dismissal is per folder and persists, and the card returns when a new unsupported category appears.
- Quick Open is file navigation, not content retrieval: it stays scoped to the
  active folder and does not surface generated artifacts or search evidence.
- Command Palette exposes only safe, context-available actions the app already
  supports. Its recency ordering lasts for the current session only; destructive
  and target-dependent operations keep their explicit flows and confirmations.

## Contribution Map

### Next

- Make loading, empty, and operation-failure states less ambiguous.
- Improve file-tree navigation and tab behaviour at large folder sizes.
- Make source versus derived state more legible without surfacing generated
  files.
- Improve file creation, rename, move, and attachment workflows.

### Coordinate First

- Folder membership, filesystem safety, deletion, or agent file permissions.
- Changes to what appears in the tree or what a search result opens.
- New workspace models, synchronization behaviour, or file storage layers.

### Not Planned

- A database-first or block-first knowledge base.
- Requiring users to copy files into a StashBase-managed workspace.
- A complex graph view as a primary navigation surface.

For Markdown-specific reading and writing, see [Markdown](markdown.md).
