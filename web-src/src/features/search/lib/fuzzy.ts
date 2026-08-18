/** Deterministic subsequence fuzzy scorer shared by Quick Open and the
 * Command Palette. Every query character must appear in order in the
 * value (case-insensitive); earlier hits score higher. Returns null
 * when the query is not a subsequence of the value.
 *
 * `contiguityBonus` rewards each hit that lands directly after the
 * previous one, so contiguous runs outrank scattered matches — Quick
 * Open uses it for filename ranking; the Command Palette deliberately
 * does not, matching loosely across label + category + id. */
export function fuzzyScore(
  value: string,
  query: string,
  { contiguityBonus = 0 }: { contiguityBonus?: number } = {},
): number | null {
  let cursor = 0;
  let score = 0;
  let previous = -2;
  for (const char of query.toLocaleLowerCase()) {
    const index = value.toLocaleLowerCase().indexOf(char, cursor);
    if (index < 0) return null;
    score += 10 - Math.min(index, 8);
    if (contiguityBonus > 0 && index === previous + 1) score += contiguityBonus;
    previous = index;
    cursor = index + 1;
  }
  return score;
}
