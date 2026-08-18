import { fuzzyScore } from './fuzzy';
import { basename } from '@/common/lib/paths';

export interface QuickOpenItem {
  path: string;
  basename: string;
  recent: boolean;
  score: number;
}

/** Quick Open ranking policy over the shared scorer: basename matches win
 * over path-only matches; contiguous and early matches win within either
 * field. */
const rank = (value: string, query: string) => fuzzyScore(value, query, { contiguityBonus: 12 });

export function rankQuickOpen(paths: string[], query: string, recentPaths: string[]): QuickOpenItem[] {
  const normalized = query.trim();
  const recentRank = new Map(recentPaths.map((path, index) => [path, index]));
  if (!normalized) {
    return recentPaths
      .filter((path, index) => paths.includes(path) && recentPaths.indexOf(path) === index)
      .map((path, index) => ({ path, basename: basename(path), recent: true, score: -index }));
  }
  return paths
    .map((path) => {
      const nameScore = rank(basename(path), normalized);
      const pathScore = rank(path, normalized);
      if (nameScore == null && pathScore == null) return null;
      return { path, basename: basename(path), recent: recentRank.has(path), score: Math.max(nameScore ?? -Infinity, (pathScore ?? -Infinity) - 8) };
    })
    .filter((item): item is QuickOpenItem => item !== null)
    .sort((a, b) => b.score - a.score || a.basename.localeCompare(b.basename) || a.path.localeCompare(b.path));
}
