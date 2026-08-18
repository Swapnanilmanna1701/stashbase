import * as React from 'react';
import '@/common/styles/tree.css';
import { ChevronDownIcon } from '@/common/components/icons';
import { outlineDepths, outlineHasChildren, visibleOutlineHeadings, type DocumentHeading } from '@/common/lib/documentOutline';

export function DocumentOutline({
  headings,
  activeId,
  onSelect,
}: {
  headings: DocumentHeading[];
  activeId: string | null;
  onSelect: (heading: DocumentHeading) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('[aria-current="location"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  React.useEffect(() => {
    const ids = new Set(headings.map((heading) => heading.id));
    setCollapsed((previous) => {
      const next = new Set([...previous].filter((id) => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [headings]);

  let emptyCount = 0;
  const visibleHeadings = visibleOutlineHeadings(headings, collapsed);
  const depths = React.useMemo(() => outlineDepths(headings), [headings]);
  const headingIndexes = React.useMemo(
    () => new Map(headings.map((heading, index) => [heading.id, index])),
    [headings],
  );
  /* Rows reuse the exempted `.tree-row` family (`chev`, `label`, `active`,
   * `collapsed`) so the outline stays visually locked to the file tree;
   * only the outline-specific layout is expressed as utilities here. */
  return <nav id="document-outline" className="flex min-h-0 flex-1 overflow-hidden" aria-label="Document outline">
    {/* No bottom padding: the outline sits in the sidebar's bottom dock,
      * where the next block's hairline does the separating — padding
      * above it reads as a white seam. */}
    <div ref={listRef} className="scrollbar-quiet flex-1 overflow-auto px-1.5">
      {/* Empty state lives in the sidebar section, which renders it
        * without loading this chunk — the list only mounts with
        * headings in hand. */}
      {visibleHeadings.map((heading) => {
        const label = heading.text || `Untitled section ${++emptyCount}`;
        const index = headingIndexes.get(heading.id) ?? 0;
        const depth = depths[index] ?? 0;
        const hasChildren = outlineHasChildren(headings, index);
        const isCollapsed = collapsed.has(heading.id);
        /* Base indent 10, not 4: depth-0 labels must line up with the
         * section header's label — header 14(pl-3.5)+16(slot)+8(gap)=38;
         * row 6(px-1.5)+2(border)+10+16(chev)+4(gap)=38. */
        return <div key={heading.id} className={'tree-row' + (activeId === heading.id ? ' active' : '') + (isCollapsed ? ' collapsed' : '')} style={{ paddingLeft: Math.min(depth, 4) * 14 + 10 } as React.CSSProperties}>
          {hasChildren ? <button type="button" className="chev cursor-pointer border-0 bg-transparent p-0" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`} aria-expanded={!isCollapsed} onClick={() => setCollapsed((previous) => {
            const next = new Set(previous);
            if (isCollapsed) next.delete(heading.id);
            else next.add(heading.id);
            return next;
          })}><ChevronDownIcon /></button> : <span className="size-4 flex-none" aria-hidden="true" />}
          <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent p-0 text-left [font:inherit] text-inherit" title={label} aria-label={`Heading level ${heading.level}: ${label}`} aria-current={activeId === heading.id ? 'location' : undefined} onClick={() => onSelect(heading)}><span className="label">{label}</span></button>
        </div>;
      })}
    </div>
  </nav>;
}
