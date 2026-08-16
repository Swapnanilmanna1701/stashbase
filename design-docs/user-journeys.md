# User Journeys

These journeys are the stable bridge between product behavior and validation.
Each `Jxx` identifier may be referenced by tests, review contracts, issues, and
release checks. Keep the steps observable and implementation-neutral; exact
fixtures and assertions remain in the test suite.

## J01: Launch into a usable workspace

**Outcome:** A new or returning user reaches useful local functionality before
optional preparation or Agent runtime work completes.

1. Launch StashBase.
2. See the Files sidebar and an expanded, reusable blank Chat in the
   document-free workspace. If AI Index is not authorized, accept its setup
   offer or skip it for this window context without losing local functionality.
3. If the library is empty, use the visible Add Folder action. Otherwise,
   choose a library folder explicitly; a fresh window does not silently resume
   a folder. A skip made in the blank window carries into this first folder so
   the same launch does not immediately repeat the offer.
4. Browse local files even when AI Index, transcription, or an Agent runtime is
   unavailable.

Important recovery: optional setup failure never blocks the workspace.

## J02: Add and open a folder

**Outcome:** A local folder joins the library without changing ownership or
requiring migration.

1. Open or create a folder through the titlebar's Library switcher.
2. Enter the folder before recursive preparation or indexing finishes.
3. Browse supported source files and switch among member folders from the
   switcher menu.
4. Optionally favorite, open in another window, sync, or remove the active
   folder through its header menu.
5. On removal, StashBase clears its state but leaves the folder on disk.

Important recovery: a failed or slow open remains retryable and does not leave
another window or folder context stuck.

## J03: Read and edit source documents

**Outcome:** The user works on ordinary source files with durable, explicit
editing behavior.

1. Open a supported source in a persistent tab.
2. Read it in the format-appropriate surface.
3. For editable Markdown or JSON, explicitly enter the appropriate editing
   state and save through the shared durability path. Valid JSON may be
   inspected and patched structurally or edited as exact source; malformed JSON
   remains recoverable in Source mode.
4. Navigate with tabs, Quick Open, outlines, Find, local links, or search
   results.
5. Close a tab or window without silently losing a live edit.

Important recovery: version conflict, parse failure, or unsupported preview
does not overwrite or disguise the source.

## J04: Prepare a hard-to-read file

**Outcome:** PDF, DOCX, XLSX, image, audio, or supported video content becomes
searchable while the original remains the visible file.

1. Add or open a source that needs preparation.
2. Continue browsing while work runs in the background.
3. Observe actionable blocked, failed, cancelled, or retryable states only
   where they affect the next action.
4. Search or let an Agent read current prepared text after completion.
5. Reprocess after a recoverable failure or explicit cancellation.

Important recovery: stale, partial, or incompatible output never counts as
current truth.

## J05: Search and open source evidence

**Outcome:** A person finds evidence across the authorized library and lands on
the visible source.

1. Open library search and enter a query.
2. Use exact text without AI Index, or configure meaning-based search by
   signing in through Supabase with Google for the included allowance, or
   supplying an OpenAI/OpenRouter key. A completed browser sign-in returns to
   the initiating StashBase window automatically when the OS permits it; the
   callback card offers **Open StashBase** when automatic return is blocked.
3. When using the hosted allowance, inspect its remaining percentage and reset
   date from the account menu; indexing and queries share that allowance.
4. Optionally narrow to one member folder.
5. Review grouped evidence and readiness guidance. Whole-token search does not
   hide a later eligible result merely because a file contains earlier
   substring-only hits.
6. Open the result without exposing a hidden derived artifact or unexpectedly
   replacing the window's active folder.

Important recovery: partial preparation, stale index state, provider failure,
and hosted quota exhaustion are distinguishable from an empty result. Exact
search remains available when hosted semantic work cannot continue.

## J06: Start and continue an Agent chat

**Outcome:** The user collaborates with the selected supported Agent against a
clear library or folder scope.

1. Use the sidebar New Chat action; opening the app or folder alone does not
   install a runtime.
2. Reuse a completely blank chat or create a fresh tab without hijacking
   existing work.
3. Review runtime readiness. If the selected runtime is missing, explicitly
   choose **Install and continue**; then connect StashBase MCP and send a
   prompt.
4. Inspect streaming output, tool activity, permission requests, attachments,
   failures, and recovery.
5. Edit and resend an earlier prompt when needed. If a response is active, it
   stops before the edited prompt begins as a new turn.
6. Open a source: the same mounted chat docks beside it. Close the last source:
   an open chat expands again.
7. Switch folders without silently rebinding a started chat.

Important recovery: runtime installation and MCP connection failures are
distinguished and offer only relevant actions; disconnects and ambiguous turn
starts fail visibly while preserving the transcript and preventing late output
from crossing sessions.

## J07: Converge chat into a document

**Outcome:** Exploratory conversation produces durable user-owned project
state.

1. Explore alternatives in Chat using explicit source context.
2. Create or open a Markdown document that will act as the Canvas.
3. Keep the same conversation beside the document.
4. Ask the Agent to write only accepted conclusions, reasoning, open questions,
   and next steps into that source file.
5. Review and edit the document as the lasting record.

Important boundary: StashBase does not automatically merge branches or treat
the transcript as the document.

## J08: Connect an external Agent through MCP

**Outcome:** An MCP-capable client uses the same authorized library and source
identity as the built-in Agent.

1. Copy the standard configuration or URL access details from Settings and
   register them in the client, following the documented setup examples.
   Built-in Chat agents connect automatically and are not configured here.
2. Orient with library information, then search or read authorized files.
3. Use bounded mutations when the client needs to write back.
4. Reindex external changes when required.
5. Confirm that paths outside member folders and hidden derived state remain
   inaccessible.

Important recovery: configuration or transport failure does not broaden
filesystem access or block ordinary app use.

## J09: Prepare and hand off a bug report

**Outcome:** The user prepares an actionable local report, reviews exactly
what may be shared, and remains the only party who submits it.

1. Start from the sidebar **Report Bug** action or native
   **Help → Report a Bug…**.
2. Describe the problem and optionally add reproduction steps in the dedicated
   review window.
3. Inspect the safe previews and explicitly include or exclude each available
   screenshot, diagnostic summary, or bounded log excerpt.
4. Choose **Prepare Report** to freeze the reviewed text and selected
   artifacts locally. Nothing is uploaded or submitted.
5. Open the prefilled GitHub issue after the files are copied to Downloads, or
   download the same files without opening GitHub, then complete any sharing
   action personally.
6. Go Back to revise and approve a fresh snapshot, or close the review to
   discard its session state.

Important recovery: one failed or unsafe artifact remains unavailable without
exposing private content or invalidating the rest of the draft; a late result
cannot revive a closed review.
