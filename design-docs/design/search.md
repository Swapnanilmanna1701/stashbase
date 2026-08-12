# Search and Retrieval

Search turns the local library into usable context for people and agents. It
serves in-app search and MCP retrieval while preserving the user's source file
as the result identity.

## Current

- Exact text retrieval works before AI Index is set up, including over raw
  JSON keys and values.
- AI Index supports meaning-based discovery when configured.
- In-app search is a popup (⌘⇧F / Ctrl+Shift+F, the titlebar Search
  control, or the Command Palette) in the app's palette chrome, searching
  the whole library by default. A scope pill narrows the next search to any
  one library folder — the same picker, folder list, and rows the chat
  composer binds a session with, so "which folder" is one control learned
  once. A folder scope names its folder outright and therefore survives a
  window folder switch.
- The popup remembers its query, mode, toggles, scope, and results across
  close and reopen — and across the folder switch its own result-opens
  cause. Reopening silently refreshes the remembered results against
  current content.
- Opening a result never switches the window's folder. A hit in the active
  folder opens normally (highlight and find hand-off, tree reveals the
  file); a hit in another member folder opens as a read-only out-of-folder
  tab in the same window, with a banner naming its folder and offering to
  open that folder in a new window. Only the no-folder workspace binds the
  picked folder on open — there is no context to preserve there.
- Scope and mode sit on the query row itself, right-aligned — they qualify
  the query being typed, and a separate settings band under the field spent
  a whole row on two short controls. The placeholder names the live scope
  ("Search in library" / "Search in <folder>"). No result tally: the list
  already shows what came back, and a count that changes on every keystroke
  is movement beside the caret.
- The search mode is one state-showing toggle: lit "≈ Similar" (the
  default) searches by meaning, quiet "= Exact" matches literal text, with
  exact-mode sub-options (Aa / Word) joining beside it. The label always
  names the current state; the ≈/= mnemonics never stand alone.
- Results from outside the active folder carry a quiet folder label;
  in-document find escalates to the popup ("All files") carrying its query
  and exact-mode options, scoped to the current folder.
- Results collect under the folder they live in, a quiet band naming each
  group (shown only when the library spans folders). Grouping never resorts
  by folder: a group sits where its strongest hit would have, and hits keep
  rank order inside it. A row then leads with what it is — file glyph, file
  name, and its in-file location as muted context — over a two-line snippet
  of evidence. In-app snippets are reading text: a leading YAML frontmatter
  block never renders, and Markdown syntax is flattened away (link text
  survives, link targets do not).
- AI Index results are listed strongest first, all of them, with no
  disclosure control: the fetch candidate count is the only limit, and the
  summary reports one number. Rank order is the only strength signal —
  hybrid scores carry no absolute meaning, so a per-hit gauge would invite
  comparisons it cannot support.
- The popup holds a fixed height and scrolls its results internally. Results
  arrive and change count while the user types, and a panel that resizes
  under the pointer makes the list impossible to aim at.
- Prepared PDF, image, DOCX, and media transcript text can be evidence, but
  opening a result returns to the original source file.
- Search distinguishes disabled, preparing, partially ready, paused, failed,
  and ready AI Index states. A paused folder keeps a persistent Resume AI Index
  action while exact text search remains usable. The popup's readiness banners
  describe the active folder — other folders' readiness is not yet reported.
- A sync failure is diagnostic and does not replace an awaiting or paused
  decision; its recovery action remains visible alongside failure guidance.
- MCP offers orientation, search with file-type categories, read, reindex,
  and bounded file operations to authorized Agent clients. The in-app popup
  does not expose a file-type filter — categories are an agent-facing
  parameter.
- The `data` type category selects JSON. AI Index uses raw JSON source
  text and keeps the visible source path as result identity.

- User-facing copy calls the configured meaning-based capability **AI Index**.
  `semantic retrieval`, `semantic indexing`, and `embedding` are reserved for
  engineering contracts and technical details; they are not alternate product
  names in UI, onboarding, warnings, README copy, or Agent tool descriptions.
- Setting up AI Index is strongly recommended, not forced. While a folder
  is open and indexing is neither authorized nor skipped, a dialog is shown
  ("Set up AI Index"), framed as the product capability being enabled rather
  than the underlying retrieval or embedding mechanism. Embedding detail stays
  in the key form and one bottom disclosure line, never the headline. Sign-in
  leads as the one primary path (hosted, free monthly usage); bring-your-own-key
  (OpenAI or OpenRouter) is the advanced fallback, which reveals a key field in
  place only when chosen. The dialog has no casual dismiss (Escape and backdrop
  do nothing), but it is not a wall: a quiet "Skip AI Index for now"
  — a per-window "for now", not a permanent opt-out — leads straight to basic
  mode, with one light line saying it can be enabled later in Settings. There
  is no confirm hop: that reassurance does the work a confirmation would have,
  and itemising the surviving local abilities would package exact text search
  as a peer feature, which it is not.
  Nothing on the dialog is pre-selected — the recommended path is marked by a
  soft tint alone, never a tint plus a coloured border, which reads as a
  choice already made.
  Browsing, editing, preview, and exact text search are local computations and must
  never be locked behind a remote service. Sign-in ships behind the account
  system; until it lands the key path is the only one that activates. The
  Files-panel setup callout and Settings remain the standing routes back to
  AI Index; the static Anonymous row does not duplicate its source or setup
  state (see [library.md](library.md)).
- Activation persists; the skip does not. Activation is stored (with the key)
  and checked over localhost, so the app opens offline, keeps serving the
  existing index, and is never re-gated by a network or service error — it
  clears only if the key is later removed. The skip, by contrast, lasts only
  for the window it was made in: folder switches within that window do not
  re-nag, but a new window offers indexing again, which is what keeps "for now"
  literal and steers gently toward enabling it. Within a window the skip clears
  on activation. The standing Files-panel "Set up AI Index" entry (and
  Settings) reopen the offer at any time — and, because the key check is
  app-wide rather than folder-scoped, that entry appears even in a window with
  no folder open, so setup is never reachable only from Settings.
- The dialog carries one plain disclosure line: original files stay local,
  only the text extracted for indexing is sent out to generate embeddings.
  This is where "embedding" surfaces — as transparency about data handling,
  not as the headline. It keeps the hosted path from reading as the one with a
  privacy cost; users otherwise assume "my own key" means "stays local" and the
  account path is the one that uploads, when neither path uploads the files.

## Experience Contract

- Search should be useful before AI Index is available.
- Result identity is always a user-visible source file, never a hidden chunk or
  generated note.
- Scope and access restrictions apply equally to app and MCP retrieval.
- Readiness should be understandable: missing results may be caused by
  preparation, indexing, scope, or search mode.
- Known-stale vectors are removed before a large changed-content workload is
  paused; still-current indexed files may continue to provide partial results.
- Embedding credentials need access only to the configured embedding model;
  provider model-list access is not required.
- On macOS, saving credentials recovers from a same-owner ACL that blocks the
  app-owned config directory. Other config access failures explain the
  ownership or write-access problem without exposing an internal temp path.
- MCP is context infrastructure, not unrestricted host-filesystem access.

## Contribution Map

### Next

- Improve clarity around search modes, readiness, partial results, and errors.
- Report readiness library-wide — the popup's banners cover only the active
  folder today.
- Improve ranking, snippets, navigation to evidence, and useful filters.
- Make context and MCP diagnostics easier to understand.
- Improve search quality for diverse local document collections.

### Coordinate First

- Result identity, source-file opening, retrieval scope, or access control.
- Indexing contracts, embeddings, storage, or sync/reconcile.
- New MCP capabilities that can read, write, or expose user data.

### Not Planned

- A vector-store or chunk-management console for ordinary users.
- Requiring AI Index for the basic browsing and exact text workflow.
- Exposing generated artifacts as normal search results or files.

See [Preparation](preparation.md) for the origin of searchable derived text.
