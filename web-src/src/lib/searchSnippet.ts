/** Display-only cleanup for meaning-based search snippets.
 *
 * The indexer keeps a Markdown file's leading YAML frontmatter inside the
 * first chunk (it is legitimately searchable, and the raw chunk text anchors
 * click-through navigation), so a hit on a file's head would otherwise render
 * `--- key: value --- # Title` as its snippet. Strip a valid, explicitly
 * closed frontmatter block so the visible snippet starts at the first
 * content line, leaving `hit.content` itself untouched.
 *
 * Delimiter rules mirror `milkdown/frontmatter.ts`. Instead of that module's
 * full YAML parse (the `yaml` package would land in the main renderer chunk
 * just for display trimming), a light shape check accepts only blocks whose
 * top-level lines look like YAML metadata — so a leading thematic break
 * followed by prose and a second `---` is never eaten.
 */

const OPENING_DELIMITER = /^(?:\uFEFF)?---[\t ]*(?:\r\n?|\n)/;
const CLOSING_DELIMITER = /^(?:---|\.\.\.)[\t ]*(?:\r\n?|\n|$)/gm;

function looksLikeYamlMetadata(block: string): boolean {
  let sawMapping = false;
  for (const line of block.split(/\r\n?|\n/)) {
    if (/^\s*$/.test(line)) continue; // blank
    if (/^\s*#/.test(line)) continue; // comment
    if (/^\s+/.test(line)) continue; // indented continuation / nested value
    if (/^-(\s|$)/.test(line)) continue; // top-level sequence item
    if (/^[^\s:][^:]*:(\s|$)/.test(line)) {
      sawMapping = true;
      continue;
    }
    return false; // prose — this is document content, not metadata
  }
  return sawMapping;
}

/** Flatten a chunk's Markdown to reading text for the result row.
 *
 *  A hit's evidence is prose, not source: rendering `## 资料来源 * [Athletics
 *  Canada](../reference/LTAD_EN.pdf)` verbatim shows the user syntax and
 *  relative paths they never wrote the search for. This drops the markers
 *  and keeps the words — link TEXT survives, link targets do not — and
 *  folds the chunk onto one line so every row has the same rhythm.
 *
 *  Display only: `hit.content` stays raw because it anchors click-through
 *  navigation into the source file. */
export function plainSnippetText(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, ' ')                   // HTML comments — the
    // PDF converter writes page markers (`<!-- stashbase-pdf-page: 69 -->`)
    // into the text it indexes, and they surfaced verbatim in snippets.
    .replace(/```[\s\S]*?```/g, ' ')                    // fenced code blocks
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')                 // ATX headings
    .replace(/^\s{0,3}>\s?/gm, '')                      // blockquote markers
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')            // list markers
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, ' ') // thematic breaks
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')           // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')            // links → link text
    .replace(/`([^`]+)`/g, '$1')                        // inline code
    .replace(/(\*\*|__)(.*?)\1/g, '$2')                 // bold
    .replace(/(?<![\w*_])[*_]([^*_\n]+)[*_](?![\w*_])/g, '$1') // italics
    .replace(/\s+/g, ' ')
    .trim();
}

/** Snippet text for a search hit: the chunk content minus any leading YAML
 *  frontmatter block, trimmed to the first content line. Falls back to the
 *  original content when nothing would remain (a chunk that is only
 *  frontmatter) so the row never renders empty. */
export function searchSnippetText(content: string): string {
  const opening = OPENING_DELIMITER.exec(content);
  if (!opening) return content;

  CLOSING_DELIMITER.lastIndex = opening[0].length;
  const closing = CLOSING_DELIMITER.exec(content);
  if (!closing) return content;

  if (!looksLikeYamlMetadata(content.slice(opening[0].length, closing.index))) return content;

  const body = content.slice(CLOSING_DELIMITER.lastIndex).replace(/^\s+/, '');
  return body.length > 0 ? body : content;
}
