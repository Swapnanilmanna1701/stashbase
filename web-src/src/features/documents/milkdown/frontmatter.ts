import { parseDocument } from 'yaml';

const OPENING_DELIMITER = /^(?:\uFEFF)?---[\t ]*(?:\r\n?|\n)/;
const CLOSING_DELIMITER = /^(?:---|\.\.\.)[\t ]*(?:\r\n?|\n|$)/gm;

export interface MarkdownFrontmatter {
  source: string;
  body: string;
}

/** Separate only valid, explicitly closed leading YAML. The source prefix is
 * retained verbatim and reattached during save, so the visual editor never
 * corrupts metadata it does not model as document blocks. */
export function splitLeadingYamlFrontmatter(markdown: string): MarkdownFrontmatter {
  const opening = OPENING_DELIMITER.exec(markdown);
  if (!opening) return { source: '', body: markdown };

  CLOSING_DELIMITER.lastIndex = opening[0].length;
  const closing = CLOSING_DELIMITER.exec(markdown);
  if (!closing) return { source: '', body: markdown };

  const parsed = parseDocument(markdown.slice(opening[0].length, closing.index));
  if (parsed.errors.length > 0) return { source: '', body: markdown };
  return { source: markdown.slice(0, CLOSING_DELIMITER.lastIndex), body: markdown.slice(CLOSING_DELIMITER.lastIndex) };
}
