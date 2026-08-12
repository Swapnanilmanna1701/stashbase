# Design Docs

These documents help builders understand what StashBase is trying to preserve,
what is already useful, and where an open-source contribution can matter.
They are a design reference and contribution map — not an implementation
directory or a replacement for issues and source code.

## Start Here

1. Read [Overview](overview.md) for the product thesis.
2. Read [Principles](principles.md) before proposing a change that affects the
   product model or access to user data.
3. Read [Architecture](architecture.md) for ownership, lifecycle, and trust
   boundaries.
4. Skim [Use Cases](use-cases.md) for the end-to-end journeys the product
   areas combine into.
5. Read [Visual Style](visual-style.md) before changing UI chrome, theming,
   or component styling.
6. Choose a product area below and use its contribution map to orient your
   work. Then inspect the current code and open issues for implementation
   details and active coordination.

## Status Labels

- **Current** — shipping experience or an accepted product contract.
- **Next** — a meaningful direction for contribution, not a release promise.
- **Coordinate first** — valuable but cross-cutting work that needs alignment
  before implementation.
- **Not planned** — intentionally outside the product shape for now.

## Product Areas

| Area | What it covers | Good starting point |
|---|---|---|
| [Markdown](design/markdown.md) | Reading, writing, linking, and previewing Markdown | Authoring experience and preview fidelity |
| [Local File Workspace](design/library.md) | Folders, file tree, tabs, and source-file workflows | Clearer everyday file operations |
| [Preparation](design/preparation.md) | Format conversion and readiness | Recovery, diagnostics, and format support |
| [Search and Retrieval](design/search.md) | Keyword, semantic, and MCP retrieval | Search clarity and result quality |
| [Agent Panel](design/agent-panel.md) | Built-in Claude/Codex side panel | Safe, compact agent collaboration |
| [Feedback and Bug Reports](design/feedback.md) | Privacy-safe local report preparation and user-controlled sharing | Actionable diagnostics without telemetry |

## How To Maintain These Docs

Keep documents concise and in English. Record durable intent, boundaries,
trade-offs, and contributor guidance. Link between docs rather than repeating
them. If a statement would become false merely because a file is renamed or a
function moves, it belongs in code or tests instead.

When user-visible behaviour, a product contract, or a contribution priority
changes, update the affected document in the same change. Do not use these
docs as a changelog or a full project-plan substitute.
