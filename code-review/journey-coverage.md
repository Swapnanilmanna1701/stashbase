# Journey Coverage

> Evidence map from stable product journeys to automated suites and residual
> release checks. Exact fixtures and assertions remain in the linked tests.

## Coverage States

- **Automated** — required CI exercises the critical outcome and recovery.
- **Partial** — decisive Seams are tested, but no single automated flow proves
  the complete user outcome.
- **Release** — the remaining evidence requires a packaged, native, real-media,
  or credentialed check.
- **Gap** — no current check proves the named outcome.

## Evidence Map

| Journey | State and automated evidence | Residual evidence or gap |
|---|---|---|
| [J01 Launch](../design-docs/user-journeys.md#j01-launch-into-a-usable-workspace) | **Automated:** [`e2e/smoke/launch.spec.ts`](../e2e/smoke/launch.spec.ts), [`e2e/journeys/library-navigation.spec.ts`](../e2e/journeys/library-navigation.spec.ts), [`e2e/visual/workspace.spec.ts`](../e2e/visual/workspace.spec.ts), and Electron lifecycle smoke. Run `pnpm test:e2e:smoke`, `pnpm test:e2e:functional`, `pnpm test:e2e:visual`, and `pnpm test:electron:smoke`. | Packaged first launch is **Release**. |
| [J02 Folder](../design-docs/user-journeys.md#j02-add-and-open-a-folder) | **Automated:** [`e2e/smoke/navigation.spec.ts`](../e2e/smoke/navigation.spec.ts), [`library-navigation.spec.ts`](../e2e/journeys/library-navigation.spec.ts), [`library-mutations.spec.ts`](../e2e/journeys/library-mutations.spec.ts), [`navigation-depth.spec.ts`](../e2e/journeys/navigation-depth.spec.ts) (favorites ordering, removal, the titlebar folder switcher), and [`search-native-dialog.spec.ts`](../e2e/journeys/search-native-dialog.spec.ts). Run smoke, functional, and `pnpm test:electron`. | A real OS folder picker and file drop are **Release**; functional uses the native-boundary Adapter or a real pointer inside the app. |
| [J03 Documents](../design-docs/user-journeys.md#j03-read-and-edit-source-documents) | **Automated:** [`e2e/smoke/document-editing.spec.ts`](../e2e/smoke/document-editing.spec.ts), [`formats-media.spec.ts`](../e2e/journeys/formats-media.spec.ts) (including XLSX sheets, merged/frozen state, image/chart support, inert external links, internal links, and preview independence), [`markdown-json.spec.ts`](../e2e/journeys/markdown-json.spec.ts), [`markdown-outline-find.spec.ts`](../e2e/journeys/markdown-outline-find.spec.ts), and document visuals. Run `pnpm test:renderer`, smoke, functional, and visual when composition changes. | Complex packaged PDF/DOCX/XLSX/media is **Release**. Safe concurrent editor/Agent recovery is a **Gap**; see [File Transactions](file-transactions.md#known-gap--renderer-conflict-recovery). |
| [J04 Preparation](../design-docs/user-journeys.md#j04-prepare-a-hard-to-read-file) | **Partial:** scheduler, conversion, cancellation, freshness, XLSX extraction bounds, and recovery run in `pnpm test:conversion-scheduler` and `pnpm test:python`; [`formats-media.spec.ts`](../e2e/journeys/formats-media.spec.ts) proves viewer failure identity. | Full packaged native/WASM preparation is **Release**. There is intentionally no broad Playwright preparation flow while the lower Seams remain the more deterministic oracle. |
| [J05 Search](../design-docs/user-journeys.md#j05-search-and-open-source-evidence) | **Automated:** `pnpm test:retrieval` proves XLSX keyword/semantic source identity; [`formats-media.spec.ts`](../e2e/journeys/formats-media.spec.ts) proves XLSX exact-search reopen; [`search-native-dialog.spec.ts`](../e2e/journeys/search-native-dialog.spec.ts), [`navigation-layout.spec.ts`](../e2e/journeys/navigation-layout.spec.ts), and [`semantic-search-ui.spec.ts`](../e2e/journeys/semantic-search-ui.spec.ts) cover the shared UI. MCP/Agent derived reads are exercised by `pnpm test:library-files`. | Credentialed provider behavior stays below UI E2E. Library-wide readiness is a product gap, not missing test coverage. |
| [J06 Agent](../design-docs/user-journeys.md#j06-start-and-continue-an-agent-chat) | **Automated:** `pnpm test:agent`, `pnpm test:e2e:agent-protocol`, and [`e2e/journeys/agent-panel.spec.ts`](../e2e/journeys/agent-panel.spec.ts) through `pnpm test:e2e:functional`. | Real CLI/account, packaged discovery, and clipboard image are **Release**. |
| [J07 Converge](../design-docs/user-journeys.md#j07-converge-chat-into-a-document) | **Partial:** document durability and deterministic Agent activity are proved separately by the J03 and J06 evidence above. | One Agent-to-reviewed-document workflow is a **Gap**. Add it only with deterministic write behavior and stable product acceptance. |
| [J08 External MCP](../design-docs/user-journeys.md#j08-connect-an-external-agent-through-mcp) | **Partial:** `pnpm test:mcp`, `pnpm test:library-files`, and `pnpm test:retrieval` prove operation, transport, auth, path, mutation, and reconcile contracts. | Third-party client UI is out of scope; packaged launcher and client-config verification are **Release**. |
| [J09 Bug report](../design-docs/user-journeys.md#j09-prepare-and-hand-off-a-bug-report) | **Partial:** `pnpm test:electron` proves collection bounds, redaction, sender-bound review, immutable approval, selected-only preparation, handoff idempotency, cleanup, and both entry Adapters. | A real packaged capture, review, Downloads copy, and browser handoff is **Release**. |

## Maintenance Rule

Update a journey when its observable product flow changes. Update this map when
coverage ownership or evidence state changes. Update the test for exact
regression details. Do not add per-test rows or copied test counts;
`pnpm test:e2e:functional --list` is the authoritative functional inventory.

E2E fixture isolation, selectors, readiness, visual baselines, and flake policy
live in [UI Regression Testing](ui-regression-testing.md). Packaged checks live
in [UI Release Sanity](../release-checklists/ui-sanity.md).
