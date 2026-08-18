# Renderer Architecture

Implementation contract for how renderer modules may depend on each other.
Styling mechanics live in [Renderer Styling](renderer-styling.md); workspace
state transitions live in [Renderer Workspace](renderer-workspace.md). This
file records only the module graph.

## Layer model

Four layers under `web-src/src/`, strictly ordered. A module may import from
its own layer and from every layer below it, never above.

1. **`common/`** — the feature-agnostic leaf: pure helpers, contract types,
   presentational components, Base UI primitives, the HTTP client, and the
   cross-feature event triggers. It imports nothing but `common/` and
   `shared/`. It may not import `store/` — `store/` already imports `common/`,
   so that direction is a cycle, and a store-connected module belongs a layer
   up.
2. **`store/`** — the single `useReducer` over one `State` of three nested
   slices, the four contexts that deliver it, the action hooks, and the pure
   domain logic those actions apply (`store/lib/`). It imports `common/` only.
3. **`features/<area>/`** — one product area: `account`, `agent-panel`,
   `documents`, `preparation`, `search`, `settings`, `workspace`. A feature
   imports `common/`, `store/`, and its own subtree. **A feature never imports
   another feature** — not a component, not a type, not a trigger function,
   and not through a dynamic `import()`. Each owns an `index.ts` barrel; that
   barrel is the feature's whole public surface, and everything else in the
   subtree is internal.
4. **`app/`** — the composition root: `App.tsx`, the global shell overlays,
   the surfaces that wire several features into one layout (`MainPane`,
   `Sidebar`), and the shell-wide keyboard and titlebar controls. This is the
   only layer allowed to import from multiple features, because composing
   them is what it exists to do. It reaches each of them **only through the
   barrel**: `@/features/documents`, never
   `@/features/documents/components/PdfPreview`.

Direction and depth are separate rules. Direction says which layers a module
may reach at all; depth says how far into a feature a caller may reach once
it is allowed to. Direction alone left `app/` importing 36 feature internals,
so every viewer, hook, and helper a feature happened to define was
load-bearing shell API and could not be moved without touching the
composition root.

Neither rule catches the third failure: `app/` *implementing* what it should
compose. Nothing about the New Chat button's agent-preference read, the
session-history resume, or the optimistic favorite write is composition —
they were in `app/components/Sidebar.tsx` only because the sidebar is where
they render. Being legal is not the test; a module belongs in `app/` when it
lays several features out together, and in the feature otherwise, whichever
surface happens to host it. `NewChatButton` and `ScopeHistoryButton` moved to
`features/agent-panel`, `ZeroFolderState`, `useFolderFavorite`, and
`useOpenFolderWindow` to `features/workspace`, and the sidebar kept only the
layout that stacks them.

## What a barrel exports

A feature's `index.ts` lists exactly what a caller outside the feature
needs, and nothing else. It is a curated surface, not a re-export of the
directory: an export that no consumer imports is API the feature now has to
keep working.

Three rules decide what a line in a barrel looks like:

- **Eager re-export** (`export { X } from '…'`) for anything the shell
  mounts unconditionally or calls at boot — the always-mounted gates, the
  hooks, the pure predicates.
- **The feature owns its own lazy boundaries.** A surface that must not
  ship in the initial chunk is exported as an already-wrapped
  `lazyWithRetry(() => import('…'))` const, so it stays a dynamic entry no
  matter who imports the barrel. Plainly re-exporting such a component
  would make it eager the moment any consumer touches the barrel for
  anything else — the barrel is a static import, so its whole static graph
  is initial JS. The caller still supplies the `Suspense` (and, where a
  failure must not take the shell down, a `LazyLoadBoundary`), because the
  fallback is a layout decision.
- **A surface, not its parts.** Where several modules only ever get used
  together behind one decision, the feature exports the decision.
  `DocumentViewer` is the worked example: it owns the file-format → viewer
  dispatch and all five viewer lazy boundaries, so adding a format is a
  change inside `features/documents/` and the composition root keeps
  rendering one component. The per-format viewers are deliberately absent
  from the barrel — being unreachable except through the dispatch is what
  keeps their chunks off the initial load.

A caller needing something the barrel does not export adds it to the barrel
— or, where the caller is reaching past a module's real purpose, gets a
proper entry point instead. `refreshLibraryMembership` was pulled out of
`useLibraryMembership.ts` into `workspace/lib/libraryMembership.ts` for that
reason: it is an imperative resync a caller needs without the poll, so
reaching it meant reaching the module that owns it, not the hook that also
happens to call it. It has since left the barrel entirely. Once the sidebar's
favorite and removal flows became `useFolderFavorite` and `useFolderRemoval`,
the resync was a consequence those hooks own rather than a step the shell
sequences, and an export with no consumer outside the feature is surface the
feature has to keep working for nobody. Barrels shrink as well as grow.

## Naming a lazy boundary

`Managed…` means **the lazily-loaded heavy half**, not "store-connected".
`ManagedQuickOpen` is not a managed version of `QuickOpen`; it *is* Quick Open,
and `QuickOpen` is the always-mounted gate that pulls it in. Reading the prefix
the other way inverts which file is the small one.

The preferred idiom is that pair, and `common/components/LazyManaged.tsx`
carries its skeleton:

- The gate, named for the surface — eager, tiny, mounted unconditionally. It
  renders nothing until its trigger fires, then renders the managed body
  through `LazyManaged`, `LazyManagedModal`, or `LazyManagedPicker`, which
  supply the `Suspense` fallback and (for modals and pickers) the overlay
  layer and error boundary.
- The body, the same name under a `Managed` prefix — a `default` export, so the
  gate's `lazyWithRetry(() => import(…))` needs no `.then` unwrap. That
  `lazyWithRetry` const sits at module scope in the gate: it must run once per
  module, not once per render.

`ModalShell`, `Menu`, `Toasts`, `DropVeil`, `TooltipButton`,
`ClipboardImportModal`, `AlertConfirmModal`, `SettingsModal`, `QuickOpen`, and
`LibrarySearch` all follow it. Prefer it for a new lazy surface.

Two variants exist and are not defects:

- **`Lazy…` local consts.** Where the heavy half is an existing component that
  was never split — `LazyPdfPreview` and its four siblings in `DocumentViewer`,
  `LazyContextMenu` and `LazyImageLightbox` in `App.tsx`,
  `LazyAgentMathMarkdown` — the const is named for the boundary and the
  component keeps its own name. Use this when the caller is a dispatch over
  several already-whole components rather than one gate over one body.
- **Plain default exports behind a barrel.** `ChatPane`, `SidebarAccountRow`,
  `UnsupportedFilesModal`, and the preparation callouts are ordinary
  components; the `lazyWithRetry` wrapper lives in the feature's `index.ts`,
  so the barrel export *is* the boundary and the file needs no prefix at all.
  `SessionHistoryMenu` is the same shape one level in: its wrapper sits in
  `ScopeHistoryButton.tsx`, the button that opens it and its only caller, so
  the boundary is still owned inside the feature without the barrel carrying
  an export nothing outside it reads.

The prefix is a reading aid, not a load-bearing contract — nothing dispatches
on it, and `scripts/check-renderer-chunks.mjs` measures the real chunk split.
Renaming across the three idioms would touch ten-plus files and the chunk
manifest for no behavior change, so leave existing names alone and pick the
idiom that matches the shape of the new boundary.

## Import specifiers

Only two forms are allowed inside `web-src/src/`: `./sibling` for a module in
the same directory, and an alias for everything else. `../` never appears in a
specifier, in any form — including the `@/../../shared/…` spelling, which
climbs out of `src/` and is a relative path in disguise.

Two aliases carry the rest, declared in both `web-src/tsconfig.json` (which
the renderer test runner reads through `TSX_TSCONFIG_PATH`) and
`web-src/vite.config.ts` (which the build reads). Both must stay in sync or one
of the two resolves and the other does not.

| Alias | Target |
|---|---|
| `@/` | `web-src/src/` |
| `@shared/` | repo-root `shared/` — cross-process contract types |

There is deliberately no alias for `server/`. Every renderer↔server contract
lives in `shared/`, one module per domain: `account.ts`, `agent-protocol.ts`,
`agent-runtime.ts`, `agent-sessions.ts`, `conversion.ts`, `embedding.ts`,
`file-formats.ts`, `html-sanitization.ts`, `index-status.ts`,
`library-files.ts`, `mcp.ts`, `preferences.ts`, `search-results.ts`,
`search-types.ts`, `sync.ts`, and `transcription.ts`. The owning `server/`
module re-exports its half so server callers keep one import site, and
`web-src/src/common/api/apiTypes.ts` re-exports the whole set so renderer
callers keep theirs — that file declares nothing of its own, because a
contract written on one side of the wire is one only that side has agreed to.

Two pairs deliberately keep separate names for what looks like one concept.
`IndexStatus` in `shared/` is the `/api/index-status` response;
`IndexerStatus` in `server/indexer.ts` is the narrower thing the indexer
itself reports, and the route composes the first from the second.
`KeywordSearchResult` in `shared/` is the wire response; `KeywordScanResult`
in `server/search-display.ts` is the raw scan before the route echoes the
query and folder back onto it. Collapsing either pair would widen an internal
type into a promise the server does not keep.

A `server/` module is free to `import 'ws'` or reach the
filesystem, so a renderer import of one is only safe while it stays
`import type` — a single value import would pull that whole graph into the
browser bundle. Removing the alias makes that mistake unrepresentable rather
than reviewable. When the renderer needs a new server-defined type, move the
type into `shared/` and re-export it from `server/`; do not add the alias
back.

Aliased specifiers are extensionless, apart from non-TS assets such as the
shared links JSON. This is not cosmetic: the boundary regexes below match
the raw specifier text, so a relative import would evade them silently.

`new URL('../workers/…', import.meta.url)` is exempt. Vite resolves that form
against the file's own location at build time and does not apply `resolve.alias`
to it, so the worker reference stays relative.

## Context value stability

The four contexts under `store/contexts/` exist to stop one slice's change
from re-rendering every consumer. Two rules keep that true, and both have
been violated in shipped code:

- **Every provider memoizes its value object.** The three state slices
  memoize per field. `ActionsContext` carries no state, but its provider
  still re-renders on every dispatch — it sits under the reducer — so an
  unmemoized `{ actions, dispatch }` literal is a new context value each
  time even though both members are stable. Stable members do not make a
  stable value.
- **A poll guards its dispatches.** `useSearchActions` re-reads index status
  every `POLL_PENDING_MS` while indexing. Dispatching an unchanged payload
  produces a new `State`, so any workspace-slice field written by the poll
  must be compared before dispatch. The comparators live in
  `store/lib/appContextHelpers.ts`; `planSemanticPollDispatches` keeps the
  guard pure rather than as a closure-local `if`, because an `if` inside the
  poll can be deleted without any test noticing.

`store/__tests__/context-slice-stability.test.ts` and
`semantic-poll-dispatches.test.ts` hold both rules. The renderer uses no
`React.memo`: the context split is the re-render boundary, so a widened
`useMemo` dep or an unguarded dispatch has no second line of defence. Adding
`React.memo` is a deliberate non-choice — reach for it only against a
measured cost, never pre-emptively.

## Where shared code goes

When a second feature needs something a first one owns, promote it rather
than importing sideways:

- Pure logic, contract types, or a presentational component → `common/`.
- State-shaped domain logic, or anything reading `State` / dispatching →
  `store/` (a `store/lib/` module, or a new action on `AppActions`).
- Rendering several features together → `app/`.

A module that is store-connected cannot go in `common/`. Split it instead:
the presentational half in `common/`, the rule that feeds it as a
`store/hooks/` hook. `SemanticIndexingNotice` is the worked example — one
view, one `useSemanticIndexingNotice`, so the Files panel and the search
popup cannot disagree about when the notice is due.

Promotion is not one-way. `common/` is the leaf layer *because* several
callers need it; a module whose consumers have narrowed to a single feature
belongs back inside that feature, where the feature can change it without
auditing the whole tree. `preparationWaitCopy` moved to
`features/documents/lib/preparationCopy.ts` for that reason — four Documents
previews are its only callers, and a name borrowed from a different feature
made it look shared when it was not.

Two counts decide it, and both must hold before a module moves down:

- **Exactly one consuming feature.** Two features means it stays in
  `common/` — a sideways import is what the layer model exists to prevent.
- **No consumer in `common/` or `store/`.** Either one pins the module in
  `common/` no matter how few features read it, because neither layer may
  import a feature. `documentOutline.ts` is pinned by the first
  (`common/components/DocumentOutline.tsx` renders it);
  `agentCatalog.ts` and `agentPreference.ts` are pinned by the second
  (`store/contexts/ActionsContext.tsx` and `AppContext.tsx` read them). Those
  two look misplaced — every other consumer is in `features/agent-panel/` —
  but moving them would put a feature import in `store/`, which the boundary
  rules reject. They are in `common/` because the layer model works, not
  despite it.

The trigger modules below are pinned for a third reason: being reachable from
either side without a feature import is their whole purpose.

## Where API access lives

A component renders; a hook talks to the server. `api` is importable from
`common/hooks/`, `store/`, and any feature's `hooks/` or `lib/` module, and
not from a component.

The rule is about what a request drags in behind it. Every call here carries
a lifecycle the JSX cannot hold: a cancel on unmount, a guard so a reply that
lands after the user moved on does not repaint the surface they moved to, and
the consequences a write owes the rest of the app. `useEmbedderSettings` is
the worked example — six commands authorize an index source, and each owes
the same three things (the shared `embedderHasKey` flag, a backfill mark, an
index refresh). As six handlers in the panel that was six chances to forget
one; as one hook it is one `authorized()` a seventh command cannot
half-apply. `useMcpAccess` is the same argument for ordering: one sequence
number decides which of several in-flight reads and mutations owns `http`, so
a status response cannot resurrect a bearer token that was just rotated away.

Where the hook goes follows the same two counts as any other shared module.
One consuming feature means the feature's own `hooks/`. Two means `common/` —
`useEmbedderState` is there because Settings gates its setup dialog on
authorization while the Files-panel callout offers to open that dialog, and
neither feature may import the other. A hook that reads `State` or dispatches
belongs in `store/hooks/`, which is also where a command the composition root
needs goes: `app/` composes features and never calls the server, so the
context menu's Reveal and Reprocess are `AppActions` members rather than an
import reaching past a barrel.

Three things are deliberately not restricted. `errorMessage`, `ApiError`, and
the asset-URL builders stay importable in components: they are pure, and a
component formatting a failure is not a component performing a request.
Contract types come from `@/common/api/apiTypes` — the same module `api.ts`
re-exports — so a view needing a payload's shape does not import the client to
get it. And `store/contexts/AppContext.tsx` reads the API directly because it
is the store, not a component: `store/` is where the workspace's own reads
belong.

## Cross-feature triggers

A feature asks another feature's surface to open through a `common/lib/`
trigger module that owns the event name and its wrapper — `settingsTrigger`,
`librarySearchTrigger`, `embeddingSetupTrigger`. The component that listens
and renders stays in the feature that owns it and imports the trigger back
from `common/`. Exporting the trigger from the owning feature would still be
a cross-feature import, so it does not count as an exemption.

Some handoffs are state changes rather than events. Those become store
actions instead: `activateChatTab` opens or reuses a Chat tab for callers
outside the Agent Panel.

## Enforcement

`.oxlintrc.json` at the repo root, run by `pnpm lint:web`.

The boundary rule is location-dependent: what a module may not import differs
per directory, and `common/` forbidding `store/` has nothing in common with
`features/search` forbidding its six siblings. `overrides[].files` is the only
way to scope a rule's configuration by path, so there is one block per layer,
one per feature, and one exempting tests. Per-feature blocks cannot be
collapsed into one — a regex cannot refer to the path of the file it is
checking, so "any sibling but my own" has to be written out per feature.

The `app/**` block is the depth rule, and the one place the layer model
constrains the composition root. It rejects `^@/features/[^/]+/.+` and says
nothing about `^@/features/[^/]+`, so the barrel resolves and every path
below it does not. `app/` needs no direction rule: it sits at the top, so
there is nothing above it to forbid.

Every block repeats the shared `^@/app/` pattern rather than hoisting it to
the base `rules`. Base entries for *other* rules do apply inside an
override-matched file, but when the *same* rule appears in both, the
override's options replace the base's instead of merging — a hoisted
`^@/app/` would be silently dropped everywhere.

The regexes match the raw `@/…` specifier, which is what makes them catch
`lazyWithRetry(() => import('@/features/…'))` as well as static imports. Four
violations in the original tree were dynamic imports only this rule found.

Alongside the boundary rules the config carries a baseline: `correctness` at
error, `suspicious` and `perf` at warn, over the typescript, unicorn, oxc,
react, import, and jsx-a11y plugins. Three deliberate calibrations:

- `react/react-in-jsx-scope` is off — the renderer uses the modern JSX
  transform, so the rule is a false positive here.
- `react/exhaustive-deps` is a warning. Several hooks narrow their deps on
  purpose and say why in a comment; making it an error would mean either
  suppressions scattered through those files or silently wrong deps.
- The `jsx-a11y` rules that require markup changes are warnings. They are
  real and worth addressing, but each is a UX decision rather than a
  mechanical fix, and the renderer's semantics are asserted separately in
  `features/workspace/__tests__/accessibility-semantics.test.ts`. Raising
  them is a follow-up, not a layering concern.

`**/__tests__/**` is exempt from the boundary rules: a renderer test may
import a feature component to render it realistically.

The API-access rule is a script rather than a tenth override block, and the
reason is the merge behavior above read from the other side. The ban applies
to component directories only — a feature's `hooks/` and `lib/` modules are
exactly where `api` belongs — so it would need a block scoped to
`**/components/**`. A second block matching a file REPLACES the first's
options for the same rule, so that block would silently drop each feature's
sibling-import patterns for every component in the tree, and keeping both
would mean duplicating all seven boundary regexes into a second set that has
to stay in sync with the first. `scripts/check-renderer-api-access.mjs` reads
the import declarations instead: it flags the `api` binding under any
`components/` directory (and the composition root's own modules), under any
alias, and passes `import type`. `pnpm lint:web` runs its unit test and then
the check, the same pairing `test:e2e:check-focus` uses.

## Implementation Map

| Role | Stable entry points |
|---|---|
| Layer roots | `web-src/src/common/`, `web-src/src/store/`, `web-src/src/features/`, `web-src/src/app/` |
| Feature public surfaces | `web-src/src/features/*/index.ts` — one barrel per area, and the only path `app/` may import |
| Documents entry point | `web-src/src/features/documents/components/DocumentViewer.tsx` — the format → viewer dispatch and every viewer's lazy boundary |
| Composition root | `web-src/src/app/App.tsx` over `app/components/` (including `MainPane.tsx` and `Sidebar.tsx`) and `app/hooks/` |
| Cross-feature triggers | `web-src/src/common/lib/settingsTrigger.ts`, `librarySearchTrigger.ts`, `embeddingSetupTrigger.ts` |
| Boundary enforcement | `.oxlintrc.json` (direction per layer/feature, depth under `app/**`) and the `lint:web` script |
| API-access enforcement | `scripts/check-renderer-api-access.mjs` — the `api` client binding is not importable from a component |
| Lazy-surface guard | `scripts/check-renderer-chunks.mjs` — the pinned dynamic-entry set and the initial-JS budget |
| Path aliases | `web-src/tsconfig.json` `compilerOptions.paths`, `web-src/vite.config.ts` `resolve.alias` |

## Validation

```bash
pnpm lint:web
pnpm typecheck
pnpm build:web
```

`pnpm lint:web` also runs `scripts/check-renderer-api-access.mjs` and its
unit test, which hold the component/hook boundary above.

`pnpm build:web` also runs `scripts/check-renderer-chunks.mjs`, which holds
the initial-JS budget and the required dynamic-entry set. Moving a lazy
surface between layers changes its manifest path — update that list rather
than raising the budget. The budget is also the check on the barrels: a
barrel that re-exports a lazy component eagerly pulls its whole chunk into
the initial load, and this is what catches it. Moving a `lazyWithRetry`
declaration from a caller into the owning feature's barrel does *not* change
the manifest — the dynamic specifier still names the same module.

Related contracts: [Renderer Workspace](renderer-workspace.md),
[Renderer Styling](renderer-styling.md), and [Agent Panel](agent-panel.md).
