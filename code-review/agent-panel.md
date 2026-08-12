# Built-In Agent Panel Design

> Code review contract: this document preserves built-in Agent Panel implementation and review constraints for maintainers and AI reviewers. For contributor-facing panel direction, see [design-docs/design/agent-panel.md](../design-docs/design/agent-panel.md).

This document captures the product design contract for the built-in Claude/Codex panel. The architecture remains in [architecture.md](architecture.md); this file is only about renderer behavior and visual direction.

## Direction

The built-in Agent panel is one folder-scoped chat surface. It should feel like
a focused chat when no document is open and a VS Code-style side panel when a
document is active, not a separate AI workspace.

A session's scope is an explicit choice, not an inherited ambient, and it is
typed: `{ kind: 'library' } | { kind: 'folder'; path }` — a missing choice
is a DEFAULT (the window's current folder when one exists, else the
library), never a third scope. The composer's leftmost pill is a
Cursor-style scope picker: a "Library" entry above a separator, then the
library membership (the same source as the sidebar list, favorites pinned).
It defaults to the window's current folder, and an unbound tab follows the
window when that default changes. Once the conversation has content, runs a
turn, or was resumed, the pill stays visible but locked — the user can never
rebind a live session to another scope (the single server-driven exception
is the `create_project` migration of a library-scoped chat, below), and its
pane header marks a binding that
differs from the window default with a muted note: "in <basename>" for a
cross-folder chat, "in Library" for a library chat while the window has a
current folder. The library scope is always called "Library" in UI copy —
never "Global".

Server-side, the WS connect URL and every session-history route accept an
optional explicit scope — `folder=<abs>` (membership-validated) or
`scope=library`; anything else, including combining the two, is rejected
with an error/400 (`resolveAgentSessionScope`). Absence falls back to the
window's current folder when one exists, else the library
(`resolveSessionBinding`). A library-scoped session runs with cwd = the
folder home (`getFolderHome()`) — the reserved library cwd. Both runtimes'
native history stores key sessions by cwd, so library-scoped history
persists under that reserved cwd, never under any member folder, and lists
via the sessions routes with `scope=library`. Library-scoped sessions do
not write `AGENTS.md`/`CLAUDE.md` bridge files (those belong to member
folders), and their preamble states that the whole library is in scope with
`search_library` as the retrieval path. Caveat: if the user adds the folder
home itself as a library folder, that folder's history and the library
history coincide (same cwd).

Claude session start pre-accepts the CLI's folder-trust gate for the
session cwd (`ensureClaudeFolderTrust` → `hasTrustDialogAccepted` in
`~/.claude.json`): a headless SDK session cannot show the trust dialog and
hangs at "working" otherwise, and Claude Code exposes no trust flag or env
override. Library membership is the user's explicit trust act, so this is
consent propagation, not a permission bypass — the write is a conservative
merge (one project's flag only; malformed config left untouched) and a
failure must never block the session.

Chat history lives on the SIDEBAR's scope headers, not in the chat pane:
the active folder's header row and the Library section header each carry a
History menu for THEIR scope (the Library header keeps history reachable
in a no-folder window). One menu merges BOTH agents' session lists for the
scope — fetched in parallel, newest first, each row tagged with its agent
so rename/delete route through that runtime (`mergeAgentSessions`); one
agent's listing failing must not blank the other's, it surfaces as a quiet
inline note instead. Resume is a store handoff: the sidebar records
`pendingResume` (`CHAT_RESUME_REQUEST` — `{ agent, sessionId, folder }`,
`folder: null` meaning the library scope, the `boundFolder` convention)
and ensures a suitable tab via the New Chat blank-tab reuse plan
(`newChatPlan`, switching a blank tab's agent in place when needed,
opening the panel when hidden). The ACTIVE, still-blank tab running the
request's agent consumes it (`shouldConsumePendingResume`) — dispatching
`CHAT_RESUME_CONSUMED` BEFORE resuming so a request can never double-fire
— and reconnects with `resume` plus the request's scope params; a
non-blank tab is never hijacked, and `CHAT_TABS_RESET` clears an in-flight
request (its sessions were just torn down). The popover component
lazy-loads at the clock's interaction boundary so react-aria stays out of
the budget-enforced initial renderer chunk.

`create_project` is the one sanctioned scope migration. Each live panel
session carries a private attribution id (`STASHBASE_AGENT_SESSION_ID` in
its spawn env, forwarded by the stdio MCP host as the
`x-stashbase-agent-session-id` header — request identity only, exactly like
`STASHBASE_WINDOW_ID`, and never read from tool arguments). Installed MCP
host binaries may predate that header; the window-fallback attribution
covers them: when the session header is absent, the call attributes to the
request window's ONE session with a turn in flight (a tool call always
happens inside its caller's turn), and any ambiguity — zero or several
turn-active sessions — attributes to nobody rather than guessing. Some
hosts (Codex) sanitize the env entirely, dropping both ids; the final
tier attributes to the app-wide SINGLE turn-active session under the same
ambiguity guard. The tool
creates the directory (folder home by default; an explicit `location` must
be inside the folder home or a member folder), registers it into library
membership without touching any window's current folder, and then applies
the rebind rule via the live-session registry: only a LIBRARY-scoped
calling session migrates — its `boundFolder()` flips to the project (so
folder removal now tears it down), the session emits `scope-changed` on its
WS, and the renderer updates `connectedScope` (pill/header) and has the
OWNING window `openFolder` the project; other windows only refresh the
membership list (Electron `window:library-folder-added` broadcast). A
folder-bound session is NEVER rebound — the tool result says the chat
stays bound — and unattributed callers (external MCP clients) only
create + register. Because both runtimes' native history stores are
cwd-keyed and the rebound session keeps running with the reserved library
cwd, a persisted session→folder override
(AppData `agent-session-folders.json`, written BEFORE the scope-changed
event) is consulted by every history surface: the library listing excludes
overridden sessions, the project listing includes them (Codex merges them
in from the library-cwd listing), direct history actions accept an
overridden session only for its override folder, Claude resume validation
accepts the override folder, and deleting the session clears its override.

Because every session is scope-pinned, a window-folder switch is NOT a
teardown trigger: chat tabs and their running sessions survive the switch,
transcripts (including queued prompts and failed-turn notices) untouched.
Bound tabs keep their binding and the cross-scope header note. What happens
to each tab on a switch is a three-way plan (`windowFolderSwitchPlan`):

- **follow** — a COMPLETELY BLANK tab (no transcript, no queued prompt, no
  active turn, no explicit pick, not resumed, no draft text, no
  attachments) follows the window by reconnecting its next session to the
  new window default.
- **freeze** — a tab that would follow but holds unsent draft text or
  attachments instead promotes its connected scope to an explicit pick:
  the draft keeps the scope the user saw, and neither this nor a later
  switch (or reconnect) can silently rebind it. The composer lifts draft
  presence into the tab model for this (and for the blank flag below).
- **keep** — everything else keeps its binding untouched.

The blank definition above is THE blank-tab rule (`isBlankChatTab`), and
each tab's AgentView mirrors it into `ChatTab.blank` (and its connected
binding into `ChatTab.boundFolder`). The window-folder switch goes
through `switchWelcomeTabPlan`: when the ACTIVE tab is already bound to
the new folder (create_project auto-select, or switching back to a chat's
own folder) NO welcome tab is spawned — that conversation is the working
entry; otherwise reuse a blank tab (preferring the preferred agent's),
else create a new tab and make it active. On a folder switch this must
not change panel visibility; only the no-tabs folder-open path opens the
panel with its one fresh tab.

Chat creation has ONE entry point: the sidebar's New Chat split button.
Its main area creates with the app-wide preferred agent
(`readPreferredAgent`); its chevron menu ("Choose agent for new chat")
only updates that preference and MUST NOT create or activate a chat
(`rememberPreferredAgent` — clicking a chat tab also updates it). The user
must press the main New Chat area to create a session.
Creation goes through `newChatPlan`: reuse the one COMPLETELY blank tab
regardless of its agent — when the agent differs, switch the blank tab's
agent in place via `CHAT_TAB_SET_AGENT` (the reducer refuses any tab
with `blank === false`, renumbers the placeholder title, and migrates
the tab's per-agent recency entry) — else create a fresh tab. New Chat
opens the panel when hidden (the existing `CHAT_TOGGLE` path). The
AgentView mount is keyed by tab id AND agent, so an in-place agent
switch unmounts the old agent's idle connection (WS teardown on unmount)
and connects the new agent on a fresh mount; blank tabs carry only
placeholder titles, so the session-title rename path stays correct.
There are no other creation surfaces: the tab-strip corner launchers and
the pane header's `+` are gone — the pane header is title-only (chat
history lives on the sidebar's scope headers, above), and switching
between open chats belongs to the chat tab strip
(each tab carries its agent's glyph). The agent registry priming
(`api.listAgents` → `AGENTS_LOADED`) lives in an always-mounted App
effect; each AgentView still refreshes the catalog after every
connection outcome.

Session teardown happens only on: native window close/retire (`onClose` →
`stopAgentRuntime` per window — this includes library-scoped sessions),
library folder removal (`stopAgentRuntimeForFolder` ends every session
BOUND to the removed folder across all windows, plus the window-close path
for windows currently showing it — library-scoped sessions report no bound
folder and MUST survive any folder removal), and the app-quit cleanup
ladder. The renderer mirrors this: a folder switch keeps `chatTabs` (see
`folderScopedResetActions('switch')`), while losing the window's folder
context (removal, another window closing it) still resets them. The chat
panel renders without a window folder too — a no-folder window can hold
library-scoped chats (the acceptance behavior: with no folder selected the
user can still ask across the whole library, and switching folders yields
a fresh working entry point without losing or silently rebinding any
existing work).

Cross-folder tabs stay scoped to their session folder end to end: `@`
mention ranking and folder-file attachment validation use the session
folder's listing (`GET /api/files?folder=` — membership-validated).
Library-scoped tabs have no single folder listing, so `@` mentions and
sidebar-file attachments are disabled there (retrieval goes through
`search_library`; transient OS-file attachments still work),
`agent-context-file` resolution passes the session folder (the route is
folder-explicit: it takes an absolute member path and validates membership),
and turn-end/tool reconcile syncs the session's folder without reloading the
window's tree. The built-in agent's MCP file tools are absolute-path based;
`STASHBASE_WINDOW_ID` in the session env is request identity only, not a
path-resolution channel. A non-absolute MCP path is a legacy compatibility
ref resolved under the default folder home — never against the window's
current folder — so a window-folder switch cannot misroute a bound
session's MCP file operations; the bound folder reaches native tools through
the session cwd and the system-prompt preamble.

The panel may make agent work easier to scan, but it should stay quiet:

- low chrome
- compact controls
- restrained borders and cards
- no decorative motion or visual metaphor
- no new workspace model separate from the user's local folder

## Renderer foundation

The renderer retains its existing CSS during the Tailwind v4 migration. Shared
semantic theme roles (surface, text, border, focus, status, density, radius,
elevation, and motion) are exposed as CSS variables and Tailwind tokens; new
work consumes those roles rather than inventing visual literals. Shared
dialogs, alert dialogs, menus, popovers, tooltips, and toasts use the
shadcn-generated Base UI adapters under `web-src/src/components/ui/`; feature
code must not recreate their focus, Escape, outside-press, collision, timer, or
announcement behavior. The shared Button adapter is used inside managed
primitives; feature-owned semantic buttons may remain native while the
migration is incremental. App splitters remain renderer-owned layout controls,
but expose separator value semantics, visible keyboard focus, and
platform-neutral Arrow/Home/End transitions. A lazily loaded blocking
primitive uses the shared native-modal loading status until Base UI is ready,
so focus containment, inertness, topmost Escape, and cancellation do not
depend on chunk timing. Never provide a feature-owned dialog fallback. React
Aria Components remain only where they
already own a transitional surface and are not a dependency choice for new
renderer work. Motion is limited to structural/status feedback and runs under
the user reduced-motion policy: transforms and layout animation stop while
essential opacity feedback remains available. Foundation primitives that are only needed
after an interaction may load at that interaction boundary, preserving the
enforced initial-renderer budget without making the feature unavailable.

The agent panel's chrome — tab strip, pane header, transcript container,
tool-activity cards, composer, attachment chips, history menu, and error
banners — is styled with Tailwind utilities and the shared
Button/StatusMessage/Menu/Input primitives. `styles/chat.css` keeps only what
utilities must not own: the `.app` grid tracks and chat splitter, the
chat-primary centring rules keyed on the `agent-head` / `agent-messages` /
`agent-composer` hook classes (keep those class names on the utility-styled
elements), the right-aligned user-turn bubble, `.agent-prose` content
typography plus the One-Dark tool/diff palette, the `@`-mention popup
(`.agent-mention-item.active` is a keyboard-navigation querySelector hook),
and the CodeMirror-owned composer input DOM. `.agent-view` stays a class-name
routing hook for the global drag-drop handler. Composer pill triggers are
labelled controls with a leading icon and an accessible name: the scope
pill ("Session folder" / "Session scope: Library"; when locked it appends
"— set for this conversation"), the model pill ("Model: Default" when
default so adjacent Defaults cannot be confused), and the mode pill
("Permission mode: …"), whose panel stacks the permission-mode list with
the effort list at the bottom (same row idiom, Default first, data-driven
from the runtime's advertised levels). Sections render only when the runtime
supports them; a locked model pill or effort list stays visible but inert.
An empty chat centers the composer as the hero layout: the
composer swaps its `agent-composer` width hook for the hero column while
empty, and keeps a stable React `key` so the same mounted instance (draft,
CodeMirror state) moves between the hero and bottom layouts. The empty-state
rotating suggestion uses a short action-first label in the user's voice and
only prefills the composer draft through the CodeMirror handle — it must never
send — and its rotation pauses while hovered or focused so the press target
cannot swap under the pointer. The connecting spinner is a keyframe
animation the global reduced-motion policy stops.

Community contributions can land as useful first iterations, but the long-term design should continue to be simplified toward this side-panel model when needed.

## Design Rules

- Keep the panel renderer-led. Do not change agent transport, session persistence, MCP, indexing, or permission policy just to support presentation changes.
- Treat an adapter exit, including one during startup, as a terminal session
  event. Its optional message is the single fatal cause: preserve transcript,
  clear busy/tool activity, and do not append a second failed-turn notice. A
  raw post-ready socket close gets the stable agent-specific disconnect
  fallback; explicit renderer/client teardown must suppress it.
  Teardown may send the courtesy protocol close frame only while the socket is
  still open; calling `send()` after it starts closing is itself a renderer
  console error and must not make clean navigation fail strict UI checks.
- Derive the shell layout from Chat visibility, document presence, and compact
  viewport state; do not add RAG/CoWork product modes. The chat-primary layout
  removes the document and splitter grid tracks without unmounting either
  surface. Hidden primary surfaces are inert so zero-width content cannot keep
  keyboard focus.
- Initialize the renderer with Chat open. Boot may create the default blank tab
  asynchronously, but the shell must not first paint a collapsed panel and
  rely on a later effect to reveal the product's default workspace.
- Opening a folder creates one fresh chat tab for the app-wide preferred
  Agent — but only when the window has no chat tabs. Existing tabs (and their
  folder-bound sessions) survive folder switches, so a switch never spawns an
  extra tab or forces the panel open. The preference defaults to Codex,
  changes only through explicit Agent selection, and is recoverable when
  local UI storage is unavailable. Runtime availability remains
  authoritative: never silently fall back from an unavailable preferred
  Agent.
- Keep the first compact-window document transition document-first. The
  responsive auto-collapse may be undone by an explicit chat-reveal action
  (the sidebar's New Chat, or the empty pane's Start chat);
  once the user does that, layout effects must not immediately close Chat
  again. Restore a responsively collapsed chat when the last document closes
  or the window becomes wide, unless the user has since changed visibility.
- Prefer small, familiar agent-chat affordances over a bespoke workbench UI.
- Treat user-action states as first-class. Permission approvals, retry actions, and user-message editing must remain visible and directly actionable. Every user message offers copy and edit-and-resend; the edited text sends as a NEW prompt — agent sessions cannot rewind, so this is resend-from-history, never a fork.
- User-turn file references always render as compact chips, never raw
  relative paths in prose. Three channels feed the chip pass: `@`-prefixed
  mentions, bare multi-segment paths, and exact occurrences of the turn's
  attachment paths (which cover spaces and CJK adjacency verbatim).
- Treat terminal turn failures as persistent transcript state. Reset the
  renderer-owned explanation guard on `turn-start`, prefer a live runtime
  error, and add at most one generic fallback for an otherwise unexplained
  failed `turn-end`. Record that failure before advancing queued follow-ups;
  duplicate terminal events must not advance the queue, and successful or
  interrupted turns must not create an error notice.
- Present a stalled Codex `turn/start` as one failed turn, then let a later
  prompt recover through a fresh native connection. Late events from the
  abandoned start must not enter the renderer; the server-side timeout and
  generation-fencing contract lives in [architecture.md](architecture.md).
- Claude session error normalization must preserve execution failure details
  before emitting `turn-end`: trim and deduplicate SDK error lists to a joined
  message capped at 2,000 characters, resolve max-turn, max-budget, and
  structured-retry error subtypes to stable fallback copy, and treat transient
  `api_retry` warnings as retry-in-progress without ending the turn. Settle
  only the active turn once, ignore repeated or late results, and keep the
  final result authoritative when the native interrupt request rejects.
- Correlate every Codex error notification to the active turn through its
  protocol `turnId`. `willRetry: true` is retry-in-progress and must not settle
  the turn or emit a permanent error; `willRetry: false` may emit one error and
  settle only the matching turn once. Ignore repeated or late terminal events,
  and treat native `interrupted` completion as non-error.
- A discovered missing Agent CLI is a setup state, not a disabled launcher or a
  generic connection failure. Keep its install command copyable and let the
  user re-run discovery after installation; do not conflate it with an
  installed runtime that has failed.
- Keep background activity compact. Tool calls may be grouped or summarized, but the user must be able to inspect them when needed.
- File outputs should be easy to open, but artifact UI should stay lightweight. Prefer rows or compact affordances over large delivery cards.
- Successful file-changing tools refresh folder and index state but never
  select their output automatically. Only the user's artifact or local-link
  action opens a document and causes Chat to dock.
- Streaming should not steal the user's scroll position. If the user has scrolled away from the bottom, show a clear jump-to-latest affordance.
- The current document is never implicit agent context. Users attach files by drag/drop, file picker, `@` mention, or a composer-focused image paste. Image paste must reuse transient attachments, preserve accompanying text, and suppress the competing clipboard library-import offer.
- The sidebar's New Chat split button owns chat creation and agent selection:
  its chevron menu only updates the default agent, while its main area is the
  sole creation action. Chat tabs own switching between open chats. The pane
  header carries only the History menu — no corner launchers, no in-panel `+`.
- Model catalogs and identifiers belong to their native runtime: use Claude's
  SDK discovery and Codex app-server `model/list`, never a shared hard-coded
  list. `undefined` means Default and must not change global CLI settings.
  Keep the renderer's explicit selected override separate from the runtime's
  active-model telemetry: only the selected override belongs in a new-session
  URL, so a runtime Default model can never be pinned accidentally. Validate a
  requested identifier against the complete current native catalog before a
  new session/turn; a missing, rejected, or stale value clears the override,
  visibly falls back to Default, and remains recoverable. Codex must collect
  every paginated `model/list` page before validation and preserve each model's
  advertised reasoning-effort identifiers/order (including object entries), so
  the effort picker only offers compatible levels. An unset effort is the
  native runtime Default and must be omitted from the connection URL; send one
  only after an explicit user choice. It must initialize and
  publish this catalog before it emits panel-ready, otherwise the first turn
  cannot be selected.
  Do not send a model override when resuming, and lock the picker after chat
  content exists so a transcript cannot silently switch models. Recover the
  active model from native thread/session metadata for both Default and
  resumed chats and surface that identity; a generic “session model” label is
  not sufficient. Preserve a fallback notice if later initialization reports
  the active Default model.
  For resumed Claude history, render the server-reported effort and keep
  missing or unsupported metadata visibly inherited instead of inventing a
  renderer default. Replay must tolerate a protocol-v1 server retained during
  restart. Codex uses the same protocol-v2 replay envelope with a null effort,
  so its normal history path does not depend on a failed metadata probe.
  Changing effort on an idle restored session retains its rendered
  transcript and native identity; the server-side history and writer lifecycle
  contract lives in [architecture.md](architecture.md).

## Validation

Run `pnpm typecheck`, `pnpm test:renderer`, and
`npx vite build --config web-src/vite.config.ts`, plus the narrow agent/server
tests for any transport, session, permission, or history seam changed. The
Playwright smoke suite proves that the Agent chat shell can launch alongside
the workspace, and the workspace visual baseline renders deterministic
"Agent unavailable" discovery. `pnpm test:e2e:agent-protocol` verifies the
fake Codex executable's stdio JSON-RPC contract directly;
`pnpm test:e2e:functional` runs that contract before a production-path
Electron journey covering new chat, folder binding, command approval,
transcript completion, a window-folder switch, and interruption. The fixture
is selected through the shipping `STASHBASE_CODEX_BIN` override and uses no
developer credentials, real CLI account, user CLI history, or network output.

A credentialed real-CLI Agent turn, clipboard-image attachment, and packaged
runtime discovery remain in the residual
[release sanity checklist](../release-checklists/ui-sanity.md). Extend the
automated Agent UI coverage only through a deterministic protocol fixture
without weakening the transport and permission contracts described here. The
shared harness, focus policy, artifact handling, and selector rules live in
[UI Regression Testing](ui-regression-testing.md).

## Current Baseline

The accepted baseline includes:

- chat-tab switching with per-agent most-recent selection (`CHAT_AGENT_OPEN`
  reveals an agent's most recent tab)
- keyboard navigation for `@` file and folder mentions. Ranking normalizes
  Unicode accents and ignores case, punctuation, whitespace, and path
  separators; basename matches precede path-only matches, ties use a
  locale-independent order, and raw workspace-relative paths remain the
  stable item IDs and inserted tokens.
- smooth chat-side resize without drag-frequency global state updates
- adaptive chat-first layout with a centred readable transcript/composer width,
  side-panel width restoration, explicit-hide precedence, and a document-first
  compact-window transition
- compact activity grouping for non-actionable tool calls: each completed
  step is a flat row (type glyph + verb + underlined file / mono command or
  query), expandable to its payload/result, with no per-step card, border, or
  status badge — inspectable command/read/search labels rather than
  lifecycle-only summaries or "Done" chips. The collapsed group summary uses
  the same Codex row shape as its steps: one leading glyph (the liveness dot
  while live, the first step's type icon once settled), the summary text, and
  a trailing disclosure chevron that only fades in on hover or while open — a
  resting summary is just icon + text, never a leading always-on caret. That
  summary is count-free and stable live vs done (categories + singular/plural,
  never a number), and never turns red on an intermediate step failure (the
  failed row tints inside the expansion; the turn's own fatal notice owns real
  failure). The turn shows ONE liveness cue in ONE place at a time: while a
  tool group is the turn's live tail it keeps its own dot + shimmer + "…"
  lit across the whole stretch — running OR in the gap between consecutive
  calls — and the generic "…is working" tail is suppressed whenever the tail
  block is a tool of any status, so the dot never blinks off and hops onto a
  separate line between calls
- turn-level working-trace fold: a settled turn's thinking/interim
  narration/tool activity collapses under one "Worked for X" header, leaving
  the final answer (the last assistant block) visible; an interrupted turn
  reads "You stopped after X" and stays expanded (no answer to isolate).
  Duration is renderer-measured wall clock keyed by the turn's user-message
  id (`AgentView` `setTurnBusy`/`stop`), so resumed history has none and shows
  a plain "Worked"/"You stopped"; while streaming the trace is flat and
  expanded, folding only on completion
- visible permission cards outside collapsed activity
- lightweight file/artifact open affordances
- jump-to-latest behavior for transcript scrolling
- GFM Agent-message rendering through React elements, never an HTML string or
  raw HTML parser. Keep remote images and non-HTTP(S), non-workspace links
  inert; local links continue through the folder-safe workspace callback.
- React Aria controls for popover dismissal, focus management, and menu/listbox
  semantics, including permission decisions and destructive history
  confirmation. CodeMirror remains the owner of composer text, selection,
  undo, and mention-key handoff; keep its presentation chat-like and its
  height capped so the transcript retains reading space. A non-image file
  attachment renders as a two-line card — a muted type glyph (the file tree's
  own `FileTypeIcon`, de-coloured through `currentColor`, never a brand hue),
  the filename, and its type label — identically in the composer (with a
  remove control) and in the sent turn. Image attachments
  show renderer-local thumbnails, never their transient filesystem paths;
  sent thumbnails remain available for the current transcript, while their URLs
  are revoked when removed, the transcript is replaced, or the panel unmounts.
  The wire prompt appends a machine-facing `Attached files:` suffix so the
  runtime can read each attachment; that suffix is context, never prose. On
  replay the server lifts it back out of the shown user message so an
  attachment reads as ONE chip instead of a chip plus its raw path
  (`restoreHistoryAttachments`, shared by both runtimes): a transient image
  becomes a thumbnail, any other known document extension becomes a name-only
  card (no preview, no read access), and a line it cannot classify —
  extension-less or an unrecognised type — stays in the prose untouched.
  Restored Claude and Codex sessions may recreate thumbnails only for live
  transient image files through the scoped local preview route; never expose
  an arbitrary path found in a transcript. The route resolves the real target
  under a non-symlinked private attachment root before it reads it. Effort
  selection, including Default, remains open across the session reconnect
  caused by a change. Its trigger stays available as a close action during that
  reconnect, while a closed picker cannot reopen until the session is ready. Leave
  trigger, Escape, and outside-interaction dismissal to the managed popup
  primitive. When a permission action removes its own controls, restore focus
  to the permission card's persistent head.
- Image-preview controls float over the image: Download and Close at the top
  right, and a bottom-centred zoom group. They need accessible names and hover
  titles; do not replace their semantic buttons with non-interactive artwork.
  Use clean, optically centred `+` and `−` line glyphs for zoom rather than
  ornate magnifying-glass icons; keep the floating control surfaces borderless.
- Skills use the composer’s `/` suggestion path, not a separate workbench
  control. The shared contract exposes only opaque selection ids and compact
  metadata; native paths remain server-side. The inline `/skill` composer token
  is display state and must not be serialized into the user prompt. Codex resolves a current id from
  `skills/list`, refreshes on `skills/changed`, and sends a native skill input;
  Claude discovers commands through its SDK and invokes the selected command
  natively. An empty or failed discovery response remains visible from the
  composer; retry only refreshes the catalog and never blocks normal prompts.
  Never concatenate skill-file contents into a prompt.

These are still implementation details, not a new product category. If the panel starts to feel heavier than VS Code/Codex/Claude Code side chat, the preferred follow-up is to reduce visual weight rather than add more structure.
