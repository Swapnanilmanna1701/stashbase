/**
 * File-mention parsing for user message text. The composer serializes its
 * atomic @-mention widget as @<path>; history replay and some runtimes
 * also emit bare multi-segment paths. This module finds those spans so
 * surfaces can chip them (transcript) or flatten them (titles, previews).
 */
import { VIEWABLE_FILE_EXTENSION_ALTERNATION } from '@shared/file-formats';
import { basename } from '@/common/lib/paths';

const FILE_MENTION_RE = new RegExp(
  `(^|\\s)@([^\\n]*?\\.(?:${VIEWABLE_FILE_EXTENSION_ALTERNATION}))(?![/.])`,
  'gi',
);
/* Bare multi-segment paths (`topic/note.md`) chip too: history replay and
 * some runtimes serialize a mention without its `@`, and a raw relative
 * path glued into prose is the single roughest thing a transcript can
 * show. At least one `/` is required so ordinary "README.md" prose stays
 * text; the lookahead permits CJK or punctuation right after the
 * extension while rejecting longer paths/words. */
const BARE_FILE_PATH_RE = new RegExp(
  `(^|\\s)((?:[^\\s/@]+/)+[^\\s/]+?\\.(?:${VIEWABLE_FILE_EXTENSION_ALTERNATION}))(?![\\w./])`,
  'gi',
);

/** Flatten mention syntax for plain-text surfaces (tab titles, previews):
 * `@topic/note.md` and bare multi-segment paths read as just the file
 * name. The transcript renders chips instead — this is for places that
 * can only hold a string. */
export function flattenFileMentions(text: string): string {
  return text
    .replace(FILE_MENTION_RE, (_raw, lead: string, path: string) => `${lead}${basename(path)}`)
    .replace(BARE_FILE_PATH_RE, (_raw, lead: string, path: string) => `${lead}${basename(path)}`);
}

export type FileMentionSegment =
  | { kind: 'text'; text: string }
  /** `start` is the span's offset in the source text — a stable key for
   *  the rendered chip. */
  | { kind: 'mention'; path: string; start: number };

/** Split user text into plain runs and file-mention spans — `@`-prefixed
 * mentions, bare multi-segment paths, and exact occurrences of this
 * turn's attachment paths (any boundary — attachment paths are known
 * verbatim, so spaces and CJK adjacency are fine). Overlapping hits keep
 * the earliest, longest match. */
export function segmentFileMentions(text: string, attachmentPaths: string[] = []): FileMentionSegment[] {
  const hits: Array<{ start: number; end: number; path: string; lead: string }> = [];
  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const [raw, lead, path] = match;
      hits.push({ start: match.index, end: match.index + raw.length, path, lead });
    }
  };
  collect(FILE_MENTION_RE);
  collect(BARE_FILE_PATH_RE);
  for (const path of attachmentPaths) {
    if (!path) continue;
    let from = 0;
    for (let at = text.indexOf(path, from); at !== -1; at = text.indexOf(path, from)) {
      hits.push({ start: at, end: at + path.length, path, lead: '' });
      from = at + path.length;
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: FileMentionSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, hit.start) });
    if (hit.lead) segments.push({ kind: 'text', text: hit.lead });
    // The mention span starts after its lead whitespace; key off the raw
    // match start so repeated paths stay distinct.
    segments.push({ kind: 'mention', path: hit.path, start: hit.start });
    cursor = hit.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments.length ? segments : [{ kind: 'text', text }];
}
