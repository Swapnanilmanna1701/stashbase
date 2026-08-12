# Markdown

Markdown is the clearest expression of the StashBase approach: an ordinary
local source file that people can write, read, search, link, and hand to an
Agent without a conversion layer becoming the product.

## Current

- Markdown source remains directly readable, editable, and indexable.
- Milkdown CrepeBuilder is the sole Markdown document surface. Writer Mode
  changes the retained document's interaction boundary; Reading View blocks
  mutation, hides authoring controls, and preserves history and selection
  across a mode switch.
- CommonMark plus GFM provides document structure, lists and task lists,
  links, images, tables, code blocks, strikethrough, and footnotes. Crepe's
  authoring controls add a slash/block menu, a contextual selection toolbar,
  link tooltip, table controls, placeholder, cursor support, and code-block
  UI. Empty notes prompt writers to type `/` to discover available blocks.
- Writers can insert images through the maintained image component. StashBase
  uploads them into the current note directory and inserts a portable,
  note-relative Markdown path; no remote upload provider or credential is
  involved. Remote image URLs are not loaded by document rendering.
- Valid leading YAML frontmatter is preserved verbatim on save but remains
  outside the visual document body. GitHub alert markers render as accessible
  styled blockquotes while retaining their standard Markdown source.
- Inline and block LaTex math are available through Crepe's KaTeX feature.
- Agent-written source fails closed before touching disk when its payload
  contains non-text control characters. Generation guidance must preserve
  Markdown and LaTeX backslashes literally rather than relying on an
  interpreted string representation.
- Contextual authoring controls retain distinct inactive, hover, and active
  states in both light and dark themes.
- Find, anchors, search-result highlighting, local-link navigation, and image
  activation attach to the Markdown document DOM in both modes.
- Markdown documents offer a session-local heading outline in the Files
  sidebar. Files and the active document outline are independently
  collapsible navigation sections; heading entries with descendants can be
  folded without changing the document. Selection moves the document's own
  scroll surface to the section and honours reduced-motion preferences. The
  outline is not a second document surface.
- Safe local links remain in StashBase; external HTTP(S) links use the system
  browser. Agent responses and Markdown documents remain distinct contexts.

## Experience Contract

- Markdown is the source of truth for editing and indexing.
- Preview should feel like a readable document, not a browser window or code
  editor.
- Editing should be typographic, structured, discoverable, and keyboard
  accessible without requiring Markdown syntax knowledge for routine work.
- Milkdown owns Markdown parsing, document history, and serialization. The
  app owns persistence, local assets, navigation, Find, and trust boundaries.
- Rich document support must preserve the local preview trust boundary.

## Contribution Map

### Next

- Improve narrow-window treatment for tables, image captions, and large
  documents.
- Add an offline-safe emoji picker if it can serialize without a remote
  dependency.
- Improve continuity between document anchors, Find, and search navigation.

### Coordinate First

- Schema, serializer, local-asset, raw-HTML, or link-handling changes.
- Features that add executable content, remote resource loading, or otherwise
  change the security model.

### Not Planned

- Replacing Markdown with a proprietary document format.
- Treating generated HTML as a user-managed source file.
- Turning preview into an unrestricted browser or script host.

Markdown belongs inside the [Local File Workspace](library.md); preparation and
retrieval contracts are described in [Architecture](../architecture.md).
