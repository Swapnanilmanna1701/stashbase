/** The outline entry and the pure tree math the sidebar outline renders
 * from. Editor-specific extraction (ProseMirror traversal, heading identity
 * across transactions) stays with the Markdown editor. */
export type DocumentHeading = { id: string; level: number; text: string; position: number };

/** A heading owns every following, deeper heading until the next peer or
 * ancestor. This is the same structural rule used by editor outline trees. */
export function outlineHasChildren(headings: DocumentHeading[], index: number): boolean {
  return index < headings.length - 1 && headings[index + 1].level > headings[index].level;
}

/** Maps headings to their structural outline depth. Markdown permits skipped
 * heading levels, but the sidebar should indent only one tree step per actual
 * parent/child relationship, just like the file browser. */
export function outlineDepth(headings: DocumentHeading[], index: number): number {
  return outlineDepths(headings)[index] ?? 0;
}

/** Compute every tree depth together so large documents stay linear. */
export function outlineDepths(headings: DocumentHeading[]): number[] {
  const ancestors: number[] = [];
  return headings.map((heading) => {
    const level = heading.level;
    while (ancestors.length && ancestors[ancestors.length - 1] >= level) ancestors.pop();
    const depth = ancestors.length;
    ancestors.push(level);
    return depth;
  });
}

/** Removes descendants of collapsed outline entries without changing the
 * retained Markdown document or its heading order. */
export function visibleOutlineHeadings(headings: DocumentHeading[], collapsed: ReadonlySet<string>): DocumentHeading[] {
  const collapsedAncestors: number[] = [];
  return headings.filter((heading) => {
    while (collapsedAncestors.length && collapsedAncestors[collapsedAncestors.length - 1] >= heading.level) {
      collapsedAncestors.pop();
    }
    const visible = collapsedAncestors.length === 0;
    if (collapsed.has(heading.id)) collapsedAncestors.push(heading.level);
    return visible;
  });
}
