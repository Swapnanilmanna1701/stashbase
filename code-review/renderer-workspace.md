# Renderer Workspace

> Review contract for one window's active-folder workspace, document tabs,
> retrieval presentation, shell overlays, and renderer liveness.

## Scope and Ownership

The active-folder workspace is the deep renderer Module. It owns folder,
document, file-mutation, and retrieval transitions behind one Interface. The
application shell owns presentation composition—Chat, dialogs, toasts, Find,
and layout—and calls that Interface instead of duplicating transition rules.

Renderer state is retained presentation state, not durable truth. The server
owns membership, source bytes, source versions, preparation completion, and
semantic readiness.

## Workspace Invariants

- Every asynchronous folder open, file load, index refresh, and binary stat
  applies only while its captured folder, tab, and generation remain current.
- Folder switching resets folder-scoped documents and readiness without
  clearing library search or silently rebinding a started or drafted Chat.
- Every site that clears folder context builds its preparation-indicator
  reset from the one shared plan in `lib/folderScopedReset.ts`. The folder
  switch/loss plan and the 412 index-status recovery ladder keep their own
  surrounding order and their own conditional workspace reset, but a
  folder-scoped indicator field belongs to that shared plan, never to one
  site's inline ladder — a stale banner outliving a recovery is the failure
  this rules out.
- Retained membership state (expanded tree rows, pending semantic names) is
  stored as keyed records, not `Set`s, so `State` stays serializable and
  structurally comparable. Read it through the `NameSet` helpers in
  `state/stateHelpers.ts`; a raw index would report inherited object
  properties as members.
- Per-agent chat-tab recency is retained state, not a projection of
  `chatTabs`: activation reorders it while tab order stays put. One helper
  owns every write so the reducer cases that open, create, activate, close,
  and re-agent a tab cannot maintain it differently.
- An out-of-folder result retains its owning member folder and stays read-only;
  it never resolves against a same-named file in the active folder.
- Document navigation and native context release cross the same save barrier.
  A failed save blocks the transition and keeps the recoverable buffer mounted.
- Tabs, trees, overlays, and dialogs expose semantic selection/focus state.
  Overlay dismissal restores focus to the initiating control.
- Tree row order, visibility, and keyboard order all come from the one tree
  model. Every row is rendered whether or not its folder is open, so rows
  register their element with the roving-focus hook and navigation resolves
  against the model's visible-path list. A row under a collapsed ancestor is
  unreachable because it is absent from that list — never because a
  stylesheet class was matched.
- JSON Tree/Source mode, expansion, selected path, and tree query are retained
  per recent tab. Only the active JSON tab owns Find/editor registration, and
  the bounded tree entry remains lazy.
- Polling, timers, controllers, and native subscriptions retire when their
  generation or window context ends. Late results cannot repopulate reset
  state.
- The blank-chat lifecycle follows [Agent Panel](agent-panel.md); the workspace
  may reveal or dock it but does not redefine Agent session scope.

## Shell Performance Contract

The initial renderer contains only window chrome and the minimum workspace
shell. Feature surfaces that open on demand remain dynamic entries. The
authoritative budget is `418 KiB` of initial static JavaScript, and the current
required dynamic-entry set lives in `scripts/check-renderer-chunks.mjs`.
Change that list or budget only when the ownership of eager shell behavior
changes, never to make an accidental dependency pass.

## Implementation Map

| Role | Stable entry points |
|---|---|
| Interface | `ActiveFolderWorkspace` in `web-src/src/store/hooks/useActiveFolderWorkspace.ts` |
| Primary owners | `web-src/src/store/state/state.ts`, `state/stateReducer.ts` and the `state/workspaceReducer.ts`, `state/chatReducer.ts`, `state/uiShellReducer.ts` sub-reducers it composes, `state/stateHelpers.ts`, `lib/folderScopedReset.ts`, `lib/folderPath.ts`, `lib/folderTransition.ts`, and the internal `hooks/useDocumentActions.ts`, `hooks/useFileActions.ts`, `hooks/useFolderActions.ts`, `hooks/useSearchActions.ts` Modules |
| Shell Adapter | `web-src/src/store/contexts/AppContext.tsx` (the single `useReducer` composition root), `web-src/src/store/contexts/WorkspaceContext.tsx`, `ChatContext.tsx`, `UiShellContext.tsx`, `ActionsContext.tsx`, `web-src/src/app/App.tsx`, `web-src/src/app/components/MainPane.tsx` |
| Renderer tree model | `web-src/src/features/workspace/lib/fileTreeModel.ts` (nesting, manual-rank ordering, visible rows), `lib/treeKeyboard.ts` (roving-focus rules), `hooks/useTreeRoving.ts` (row registry and per-row binding) |
| Server transport Adapter | `web-src/src/common/api/api.ts`, `apiTransport.ts` |
| Electron lifecycle Adapter | `onPrepareContextRelease` and folder/library events consumed by `useActiveFolderWorkspace.ts` |
| Focused evidence | `web-src/src/store/__tests__/` (including `index-status-request.test.ts`, `context-slice-stability.test.ts`, `folder-path.test.ts`, `folder-transition.test.ts`, `folder-scoped-reset.test.ts`), `web-src/src/features/workspace/__tests__/` (including `file-tree-model.test.ts`, `tree-keyboard.test.ts`, `workspace-surfaces.test.ts`, `accessibility-semantics.test.ts`), `web-src/src/features/preparation/__tests__/preparation-notices.test.ts`, `web-src/src/common/__tests__/workspace-layout.test.ts`, `web-src/src/common/__tests__/overlay-stack.test.ts`, `lazy-load.test.ts`, `api-transport.test.ts`, and `scripts/check-renderer-chunks.mjs` |

The four action hooks are private Seams inside the workspace Module. Do not make
components depend on them directly; that would create a second transition
Interface.

`AppContext.tsx` owns exactly one `useReducer` over the single `State` shape in
`state.ts` — that stays the one source of truth. `State` is three nested
slices (`WorkspaceSlice`, `ChatSlice`, `UiShellSlice`); slice membership is
declared once, by the field's position in one of those interfaces, and nothing
restates it. `reducer` composes one sub-reducer per slice, each of which sees
every action and rebuilds only its own slice, so an action spanning two slices
is expressed once per slice rather than in a coordinating branch. A sub-reducer
answers `undefined` for an action it does not own; an action **no** slice
claims therefore produces `undefined` instead of a silent no-op, which is what
replaces the exhaustiveness check the single pre-split switch got from the
compiler.

State is NOT exposed through one merged read hook. Delivery is four sibling
contexts: `WorkspaceContext` publishes `state.workspace` plus the derived
`activeTab`, `ChatContext` and `UiShellContext` publish their slice verbatim,
and `ActionsContext` carries the stable `actions`/`dispatch` pair. A component
that reads one slice does not re-render when a dispatch only touches another.
Components call
`useWorkspace()` / `useChat()` / `useUiShell()` / `useAppActions()` for exactly
what they need; there is no merged `useApp()`. A component that genuinely reads
across slices throughout its body (`AgentView.tsx`, `App.tsx`) may merge them
into one local object after calling the hooks — that's a local convenience,
not a second Interface, and it does not change which slice's change triggers
that component's own re-render.

## Validation

Run:

```bash
pnpm typecheck
pnpm test:renderer
pnpm build:web
```

Run `pnpm test:e2e:smoke` for launch/navigation/save behavior and
`pnpm test:e2e:functional` for affected folder, tab, search, focus, or layout
journeys. Use `pnpm test:e2e:visual` only for representative composition
changes.

Related journeys: [J01](../design-docs/user-journeys.md#j01-complete-onboarding-and-reach-first-value),
[J02](../design-docs/user-journeys.md#j02-add-and-open-a-folder), and
[J03](../design-docs/user-journeys.md#j03-read-and-edit-source-documents), plus
[J05](../design-docs/user-journeys.md#j05-search-and-open-source-evidence) for
search presentation and result navigation, and
[J10](../design-docs/user-journeys.md#j10-turn-a-local-project-into-durable-agent-assisted-work)
for the complete cross-surface loop, and
[J11](../design-docs/user-journeys.md#j11-turn-a-conversation-into-a-project)
for project registration and originating-window entry.
Related contracts: [Window Lifecycle](window-lifecycle.md),
[File Transactions](file-transactions.md), [Agent Panel](agent-panel.md), and
[UI Regression Testing](ui-regression-testing.md).
