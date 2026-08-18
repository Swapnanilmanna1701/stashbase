/**
 * The library search popup's result shape: one flat entry list that drives
 * keyboard navigation, aria ids, and click handling, plus the grouped views
 * the renderer walks in the SAME order. Building both in one pass is what
 * keeps every `index` a valid position in the flat list — the two structures
 * can never drift because neither is derived from the other after the fact.
 */
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { KeywordMatch, LibraryKeywordFile, LibraryKeywordSearchResult } from '@/common/api/api';
import type { LibrarySearchMode } from '@/common/lib/librarySearchTrigger';
import { orderKeywordFiles, type LibrarySemanticHit } from '@/features/search/lib/librarySearch';

export type ResultEntry =
  | { kind: 'semantic'; hit: LibrarySemanticHit }
  | { kind: 'file'; file: LibraryKeywordFile }
  | { kind: 'match'; file: LibraryKeywordFile; match: KeywordMatch };

/** The DOM contract every result row spreads, keyed off its position in the
 *  flat entry list — shared by the semantic row component and the keyword
 *  rows the popup renders inline. */
export interface RowProps {
  id: string;
  role: 'option';
  'aria-selected': boolean;
  onMouseMove: () => void;
  onMouseDown: (event: ReactMouseEvent) => void;
}

/** A folder's run of semantic hits; `index` is the row's position in the
 *  flat keyboard-entry list. */
export interface SemanticGroup {
  folder: string;
  rows: { hit: LibrarySemanticHit; index: number }[];
}

/** One matched file with its listed matches; every `index` points into
 *  the flat keyboard-entry list. */
export interface KeywordFileGroup {
  file: LibraryKeywordFile;
  index: number;
  matches: { match: KeywordMatch; index: number }[];
  hiddenCount: number;
}

export interface KeywordFolderGroup {
  folder: string;
  files: KeywordFileGroup[];
}

export interface SearchEntries {
  entries: ResultEntry[];
  semanticView: { groups: SemanticGroup[]; total: number } | null;
  keywordGroups: KeywordFolderGroup[];
}

/** Collect ranked results under their folder WITHOUT resorting them: a
 *  folder's group lands where its first (strongest) member would have, and
 *  members keep the order they arrived in. */
export function groupByFolder<T>(items: readonly T[], folderOf: (item: T) => string) {
  const groups: { folder: string; items: T[] }[] = [];
  const byFolder = new Map<string, (typeof groups)[number]>();
  for (const item of items) {
    const folder = folderOf(item);
    let group = byFolder.get(folder);
    if (!group) {
      group = { folder, items: [] };
      byFolder.set(folder, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export function buildSearchEntries({ mode, semanticHits, keywordResult, activeFolderPath }: {
  mode: LibrarySearchMode;
  semanticHits: LibrarySemanticHit[] | null;
  keywordResult: LibraryKeywordSearchResult | null;
  activeFolderPath: string;
}): SearchEntries {
  const entries: ResultEntry[] = [];
  if (mode === 'semantic' && semanticHits) {
    // Every fetched hit is listed — the fetch cap is the only limit, so
    // the list needs no disclosure control — collected under its folder.
    // Grouping keeps a folder's hits in ONE place instead of scattering
    // them down the list, and relevance still drives both levels: a
    // group sits where its strongest hit would have, and hits stay in
    // rank order inside it.
    const groups: SemanticGroup[] = [];
    for (const group of groupByFolder(semanticHits, (hit) => hit.folder)) {
      const rows: SemanticGroup['rows'] = [];
      for (const hit of group.items) {
        entries.push({ kind: 'semantic', hit });
        rows.push({ hit, index: entries.length - 1 });
      }
      groups.push({ folder: group.folder, rows });
    }
    return {
      entries,
      semanticView: { groups, total: semanticHits.length },
      keywordGroups: [],
    };
  }
  if (mode === 'keyword' && keywordResult) {
    // Same folder grouping over the file groups: active-folder files
    // lead (orderKeywordFiles), so their folder leads too.
    const groups: KeywordFolderGroup[] = [];
    const ordered = orderKeywordFiles(keywordResult.files, activeFolderPath);
    for (const group of groupByFolder(ordered, (file) => file.folder)) {
      const files: KeywordFileGroup[] = [];
      for (const file of group.items) {
        entries.push({ kind: 'file', file });
        const fileIndex = entries.length - 1;
        const matches: KeywordFileGroup['matches'] = [];
        for (const match of file.matches) {
          entries.push({ kind: 'match', file, match });
          matches.push({ match, index: entries.length - 1 });
        }
        files.push({ file, index: fileIndex, matches, hiddenCount: file.totalMatches - file.matches.length });
      }
      groups.push({ folder: group.folder, files });
    }
    return { entries, semanticView: null, keywordGroups: groups };
  }
  return { entries, semanticView: null, keywordGroups: [] };
}
