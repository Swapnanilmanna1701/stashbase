/**
 * The pure half of the file tree's roving-tabindex keyboard model.
 *
 * A `tree` widget carries exactly ONE tab stop; the arrow keys move
 * focus between rows once you are inside it. Everything here answers
 * that in terms of paths and indices, so it can be tested without a DOM
 * and without React. `hooks/useTreeRoving.ts` owns the stateful half.
 */

/**
 * Which row owns the tree's single tab stop.
 *
 * The user's last focused row wins while it is still on screen;
 * otherwise the selected row; otherwise the first row, so a freshly
 * mounted (or freshly collapsed) tree is never a dead tab stop.
 */
export function resolveRovingPath(
  rovingPath: string | null,
  selectedPath: string | null,
  visiblePaths: string[],
): string | null {
  if (rovingPath && visiblePaths.includes(rovingPath)) return rovingPath;
  if (selectedPath && visiblePaths.includes(selectedPath)) return selectedPath;
  return visiblePaths[0] ?? null;
}

/**
 * Where a navigation key moves the tab stop from `index`, or `null`
 * when the key is not one of ours or the move runs off the end.
 *
 * Deliberately does NOT wrap: ArrowDown on the last row leaves focus
 * where it is (Home / End are how you jump to the ends).
 */
export function nextFocusIndex(key: string, index: number, count: number): number | null {
  let target: number;
  if (key === 'ArrowDown') target = index + 1;
  else if (key === 'ArrowUp') target = index - 1;
  else if (key === 'Home') target = 0;
  else if (key === 'End') target = count - 1;
  else return null;
  return target >= 0 && target < count ? target : null;
}

/**
 * The registered rows for `paths`, in that order, skipping paths with
 * no live row.
 *
 * Generic over the row so the ordering rule stays testable without a
 * DOM; the hook instantiates it at `HTMLElement`.
 */
export function orderedRows<T>(paths: string[], rows: ReadonlyMap<string, T>): T[] {
  const ordered: T[] = [];
  for (const path of paths) {
    const row = rows.get(path);
    if (row !== undefined) ordered.push(row);
  }
  return ordered;
}
