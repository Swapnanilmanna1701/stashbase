/**
 * Roving-tabindex focus for the file tree.
 *
 * The tree is one tab stop; arrow keys move focus between rows once you
 * are inside it. `useTreeRoving` holds that state for the whole tree and
 * publishes it on `TreeRovingContext`; `useTreeRow` is what an individual
 * row binds to.
 *
 * ROW REGISTRY, not a DOM query. Navigation used to find its siblings by
 * running `querySelectorAll('[role="treeitem"]')` over the nearest
 * `[role="tree"]` and dropping anything inside a `.tree-children.collapsed`
 * subtree — every collapsed row is rendered and merely hidden by CSS, so
 * visibility had to be re-derived from a class name. That made keyboard
 * navigation silently depend on a stylesheet: renaming that class broke
 * arrow keys with nothing to catch it. Rows now hand their element to this
 * hook through a ref, and order and visibility come from `visibleNodePaths`
 * — the same list the tree renders from. The pure rules live in
 * `lib/treeKeyboard.ts`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { nextFocusIndex, orderedRows, resolveRovingPath } from '@/features/workspace/lib/treeKeyboard';

export interface TreeRovingValue {
  /** The one row that currently holds the tree's tab stop. */
  rovingPath: string | null;
  /** Every on-screen row path, in render order. */
  visiblePaths: string[];
  setRovingPath: (path: string) => void;
  /** Live rows by path — collapsed ones included, so reads go through
   *  `visiblePaths` rather than trusting the map's membership. */
  rows: Map<string, HTMLElement>;
}

export const TreeRovingContext = createContext<TreeRovingValue>({
  rovingPath: null,
  visiblePaths: [],
  setRovingPath: () => undefined,
  rows: new Map(),
});

/** Tree-level state. Feed the result straight to `TreeRovingContext.Provider`. */
export function useTreeRoving(visiblePaths: string[], selectedPath: string | null): TreeRovingValue {
  const [rovingPath, setRovingPath] = useState<string | null>(null);
  const rows = useRef<Map<string, HTMLElement>>(new Map()).current;
  const effectiveRovingPath = resolveRovingPath(rovingPath, selectedPath, visiblePaths);
  return useMemo(
    () => ({ rovingPath: effectiveRovingPath, visiblePaths, setRovingPath, rows }),
    [effectiveRovingPath, visiblePaths, rows],
  );
}

export interface TreeRow {
  /** 0 for the one row holding the tab stop, -1 for every other. */
  tabIndex: number;
  ref: (element: HTMLElement | null) => void;
  onFocus: () => void;
  /** ArrowDown/Up/Home/End. Returns true when it consumed the key. */
  moveFocus: (event: KeyboardEvent<HTMLElement>) => boolean;
  /** Focus the next visible row — ArrowRight on an already-open folder. */
  focusNext: () => void;
  /** Focus this row's parent row. False when it has none. */
  focusParent: () => boolean;
}

/** Per-row binding. `parent` is the owning folder path (`''` at the root). */
export function useTreeRow(path: string, parent: string): TreeRow {
  const { rovingPath, visiblePaths, setRovingPath, rows } = useContext(TreeRovingContext);

  const ref = useCallback((element: HTMLElement | null) => {
    if (element) rows.set(path, element);
    else rows.delete(path);
  }, [rows, path]);
  const onFocus = useCallback(() => setRovingPath(path), [setRovingPath, path]);

  /** This row's place in the visible order, and that order's elements. */
  function position(): { items: HTMLElement[]; index: number } {
    const items = orderedRows(visiblePaths, rows);
    const self = rows.get(path);
    return { items, index: self ? items.indexOf(self) : -1 };
  }

  return {
    tabIndex: rovingPath === path ? 0 : -1,
    ref,
    onFocus,
    moveFocus(event) {
      const { items, index } = position();
      if (index < 0) return false;
      const target = nextFocusIndex(event.key, index, items.length);
      if (target === null) return false;
      event.preventDefault();
      items[target].focus();
      return true;
    },
    focusNext() {
      const { items, index } = position();
      if (index < 0) return;
      items[index + 1]?.focus();
    },
    focusParent() {
      if (!parent || !visiblePaths.includes(parent)) return false;
      const row = rows.get(parent);
      row?.focus();
      return !!row;
    },
  };
}
