import { basename } from '@/common/lib/paths';
import type { FileMeta, FolderMeta } from '@/common/api/apiTypes';

export type MentionSuggestion = { path: string; kind: 'file' | 'folder' };

/** Rank the workspace item a person is most likely typing and keep ties stable. */
export function rankMentionSuggestions(
  files: FileMeta[],
  folders: FolderMeta[],
  query: string,
  limit = 8,
): MentionSuggestion[] {
  const needle = normalizeMentionText(query);
  const suggestions = [
    ...files.map((file) => ({ path: file.name, kind: 'file' as const })),
    ...folders.map((folder) => ({ path: folder.path, kind: 'folder' as const })),
  ];
  return suggestions
    .map((suggestion) => ({ suggestion, score: mentionScore(suggestion.path, needle) }))
    .filter((candidate): candidate is { suggestion: MentionSuggestion; score: number } => candidate.score !== null)
    .sort((a, b) => a.score - b.score
      || basename(a.suggestion.path).length - basename(b.suggestion.path).length
      || comparePaths(a.suggestion.path, b.suggestion.path))
    .slice(0, limit)
    .map((candidate) => candidate.suggestion);
}

function mentionScore(path: string, query: string): number | null {
  if (!query) return 5;
  const fileName = normalizeMentionText(basename(path));
  const lowerPath = normalizeMentionText(path);
  if (fileName === query) return 0;
  if (fileName.startsWith(query)) return 1;
  if (fileName.includes(query)) return 2;
  if (lowerPath.startsWith(query)) return 3;
  if (lowerPath.includes(query)) return 4;
  return null;
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeMentionText(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\p{M}\p{P}\p{Z}]+/gu, '');
}
