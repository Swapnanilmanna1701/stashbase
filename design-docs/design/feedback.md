# Feedback and Bug Reports

**Status: Current**

## User Outcome

When StashBase fails, a user can prepare a useful bug report without hunting
for logs or surrendering control of local information. **Help → Report Bug…**
remains available through the native menu even when the renderer is damaged.

## Current Experience

StashBase captures only the current app window, a bounded recent application
log excerpt, and non-sensitive version and platform diagnostics. A review
dialog previews every artifact—including renderer error details when the Error
Boundary opened the flow—and lets the user exclude the screenshot, logs, or
error details, describe the problem, copy the structured details, or save the
report locally. Continuing pre-fills the repository's Bug Report form, copies
the full details, and reveals the temporary files so the user can choose what
to attach. While an action is running, the reviewed fields and attachment
choices are locked. Offline Save never replaces an existing companion
screenshot or log without the user choosing another report name.

Nothing is submitted automatically. StashBase has no reporting backend,
telemetry, GitHub OAuth, or GitHub token. Screenshots are treated as sensitive;
structured logs expose only time, severity, and subsystem; multiline payloads
and any unstructured tail fragments are dropped. Error details are byte-bounded
and receive broad credential and path redaction in addition to mandatory user
review. The report overlay remains hidden until current-window capture finishes,
so it cannot obscure the state being reported.

## Constraints

- Report collection and temporary-file ownership stay in the Electron main
  process behind one narrow renderer interface.
- Collection never includes settings, environment variables, unredacted
  library paths or contents, Agent transcripts, arbitrary files, or a
  desktop-wide screenshot.
- Drafts live in app-owned temporary state and expire on a bounded lifecycle.
- A draft remains bound to the StashBase window that captured it. A newer
  preparation request evicts older drafts and prevents an older capture still
  in progress from becoming shareable. Closing that window releases both its
  drafts and request bookkeeping.
- Platform log discovery belongs to Electron, not renderer path conventions.
- Each copy, save, or browser handoff uses an immutable snapshot of the
  reviewed draft; later preparation cannot mutate that operation.

## Next Contributions

Keep new diagnostics visibly enumerated, non-sensitive, bounded, and covered by
focused tests. Any proposal for automatic upload or background telemetry
requires a separate product decision rather than extending this flow silently.
