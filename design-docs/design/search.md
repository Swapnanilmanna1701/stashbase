# Search and Retrieval

## User Outcome

People and Agents can find relevant evidence across authorized local folders
and return to the user-visible source that supports it.

## Scope and Non-goals

This area owns exact and meaning-based retrieval, result presentation,
readiness explanations, scope, and source-evidence identity. Together with
Preparation, it forms the local RAG layer. It does not own source preparation,
general file navigation, or Agent conversation UI.

StashBase does not expose a vector-store console or generated chunks as
user-managed results.

## Current Experience

- Exact text search works without AI Index, including raw JSON and current
  prepared text. Whole-token search applies its result cap after token
  filtering, so substring-heavy files do not hide later eligible evidence.
- AI Index provides meaning-based retrieval when an embedding source is
  configured. Product copy says **AI Index**; engineering terms such as
  semantic indexing and embeddings appear only where technically necessary.
- Setup offers a Supabase browser sign-in with Google and an included monthly
  allowance as the primary path, with OpenAI/OpenRouter keys as the advanced
  path. The active source is explicit, while inactive account and key
  credentials remain available for later switching. After browser sign-in,
  the initiating desktop window returns to the foreground and the centered
  callback card attempts to close. If the OS or browser blocks the automatic
  handoff, the card offers an explicit **Open StashBase** action.
- The search popup searches the whole library by default and can narrow to one
  member folder. It remembers query, mode, options, scope, and results across
  close, reopen, and folder switches, then refreshes against current content.
- MCP retrieval mirrors the popup: semantic search defaults to the whole
  library, while MCP keyword search requires a member folder or a path prefix
  whose owning member can be derived. Both narrow by folder root and path
  prefix; MCP additionally narrows by source file-type categories.
- Exact and Similar modes share one query surface. Results preserve rank while
  grouping evidence by folder when needed.
- A result always identifies a source file. Evidence may come from PDF, DOCX,
  XLSX worksheet text, OCR, or transcript text, but opening it never exposes AppData. Cross-folder
  results open read-only without unexpectedly switching an active folder.
- Readiness distinguishes disabled, preparing, partial, paused, failed, and
  ready states. Exact search remains usable while AI Index is absent or
  deferred.
- AI Index setup is strongly recommended but not a gate for local browsing,
  editing, preview, or exact search. A fresh blank window offers setup before a
  folder is selected. Activation persists; “Skip for now” is retained only in
  the current window. A blank-window skip carries into the first folder opened
  so one launch makes one offer. Returning to a skipped folder stays quiet;
  another folder or a fresh window re-offers setup. The choice remains
  reversible from Files or Settings.
- Hosted indexing and meaning-based queries draw from one token allowance.
  The account menu shows identity, remaining percentage, and reset date. When
  the allowance is exhausted, hosted semantic work stops while Exact search
  and every local-file workflow remain available. Pending semantic work
  resumes after the allowance refreshes or an available BYOK source is
  selected.
- In-app and MCP retrieval share source identity and access rules. MCP also
  supports validated source-type categories, including **Spreadsheets** for
  `.xlsx` sources.

## Experience Contract

- Missing results can be explained by scope, mode, preparation, indexing, or
  provider state; those states must not collapse into one generic empty view.
- Known-stale semantic evidence is unavailable before a paused large workload
  is presented. Current indexed files may still provide partial results.
- Result scope never widens silently, and a derived path never crosses the
  product boundary.
- BYOK credentials are managed through Settings. Account login starts only
  from an explicit Sign in action in setup, Settings, or the account menu.
  Browsing local files and serving an existing local index never depends on
  online authentication.
- Account sessions remain Node-owned. Renderer responses contain only account
  display/quota state, and the Python daemon receives only an ephemeral
  loopback credential rather than Supabase access or refresh tokens.
- A credential save fails with an actionable error when the app-owned settings
  path is not writable. StashBase does not change filesystem ownership, flags,
  or access-control entries to make the save succeed.
- MCP is context infrastructure over authorized folders, not a general host
  filesystem interface.

## Cross-area Seams

- [Preparation](preparation.md) owns the currency of derived evidence.
- [Documents](documents.md) owns navigation after a result opens.
- [Workspace](workspace.md) owns member folders and out-of-folder tabs.
- [Agent Panel](agent-panel.md) consumes the same retrieval through MCP.

## Contribution Direction

### Next

- Clarify modes, partial readiness, paused work, and errors.
- Report library-wide readiness rather than only the active folder.
- Improve ranking, snippets, source navigation, and useful filters.
- Improve MCP and context diagnostics.

### Coordinate First

- Source identity, scope, access control, indexing, embeddings, or reconcile.
- New MCP capabilities that expose or mutate user data.

### Not Planned

- Requiring AI Index for the basic local workflow.
- A chunk or vector administration surface for ordinary users.
- Generated artifacts as normal files or result identities.

## Related Journeys and Contracts

Journeys: [J05](../user-journeys.md#j05-search-and-open-source-evidence) and
[J08](../user-journeys.md#j08-connect-an-external-agent-through-mcp).

Contracts: [Data Lifecycle](../../code-review/data-lifecycle.md) and
[MCP Access](../../code-review/mcp-access.md).
