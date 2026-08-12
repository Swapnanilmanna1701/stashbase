# Code Review Contracts

These documents are maintainer-facing review contracts for areas where small
code changes can break liveness, data ownership, security, or renderer
invariants.

They are intentionally separate from `design-docs/`:

- `design-docs/` explains product intent, system boundaries, and contribution
  areas for humans.
- `code-review/` records deeper engineering invariants, high-risk paths, and
  validation expectations for maintainers and AI reviewers.

Before changing code, read the relevant `design-docs/` area for intent, then
read the relevant `code-review/` contract for implementation risks.

Current contracts:

- [Architecture](architecture.md) — detailed system ownership and runtime map.
- [Data Layer](data-layer.md) — correctness, recovery, liveness, and
  derived-state contracts.
- [Markdown Rendering](markdown-rendering.md) — preview pipeline, iframe
  boundary, navigation, and renderer safety.
- [Agent Panel](agent-panel.md) — built-in Claude/Codex panel review
  constraints.
- [Renderer Styling](renderer-styling.md) — token layer, Tailwind mapping,
  primitives, and the CSS exemption inventory.
- [UI Regression Testing](ui-regression-testing.md) — Electron Playwright
  layers, isolation, visual baselines, CI artifacts, and residual release
  sanity.

Keep these files English-only and current when a code change modifies the
contract they describe. Prefer automated tests for precise regressions; use
these files to preserve the review context that tests alone do not explain.
