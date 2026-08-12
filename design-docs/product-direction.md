# Product Direction

StashBase is evolving toward three connected capabilities:

> An Obsidian-like local file workspace, a VS Code-like Agent Panel, and
> Cursor-like document indexing.

## Local File Workspace

People work in ordinary folders. StashBase should make those folders pleasant
to browse, read, edit, organize, and hand to an agent without replacing them
with a database, block editor, or proprietary storage model.

## Agent Panel

The built-in Agent Panel belongs to the current folder. Before a document is
opened, that same chat is the primary workspace; once a document appears, it
adapts into a side panel alongside the source. It is a convenient client of
StashBase context, not a separate AI workspace and not a replacement for
external agent clients.

## Document Indexing

Opened folders become searchable context. Retrieval should work by meaning and
keyword, while hard-to-read formats are prepared behind the scenes. The product
should explain readiness and failures clearly without becoming a search or
vector-database administration console.

### AI Index source and activation

AI Index needs a source of embedding capacity, and StashBase strongly steers
every user to set one up at first run — an unindexed library has a degraded
Agent — while stopping short of forcing it. Two sources are intended: a hosted
StashBase account with free monthly usage as the low-friction default for most
people, and a bring-your-own OpenAI/OpenRouter key for advanced users. The
hosted account is not built yet; until it ships, the key path is the only one
that activates.

Recommend, don't lock. Signing in should unlock StashBase's hosted service, not
unlock computation the user's own machine can already do — so browsing, editing,
preview, and keyword search must never be gated behind a remote login. The setup
dialog leads hard toward enabling indexing and has no casual dismiss, but it
offers a deliberate, low-emphasis exit ("Skip AI Index for now") to a
"basic mode". No-index mode is a real, supported state, not a peer presented
with equal weight — so the exit is a plain, low-key link, a per-window "for
now" rather than a permanent opt-out (a fresh window re-offers indexing), and
the surviving local abilities are not advertised as a competing feature; the
default guides everyone to enable.

Activation must not turn local files into something that needs the cloud to
open. The governing rule: first use should choose an indexing source, but daily
use must never depend on online auth to reach local files. Activation persists
locally, while a skip applies only to the current window; the app opens and
serves its existing index offline; a network or service error never forces
re-authentication; and when hosted free usage is exhausted, new AI Index
updates pause while the existing index and Agent retrieval keep working. In
basic mode the Agent still connects but flags, on first use or a failed
retrieval, that indexing is off. Signing out or removing the key returns the
library to the unactivated state.

## Current Investment Themes

The current direction favours contributions that improve:

- Markdown authoring and preview fidelity.
- The clarity and reliability of preparation, indexing, and retrieval.
- The usability and safety of the Agent Panel.
- The local-file workspace's everyday reading and maintenance workflows.
- Cross-platform reliability and an approachable contributor experience.

These themes guide prioritisation; they are not release commitments. Area-level
work and its status live in the [design documents](README.md).
