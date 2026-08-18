/**
 * Shared Tailwind class recipes for the pill trigger + pill menu idiom used
 * by the composer's scope/model/mode pills and the search popup's scope
 * menu, so "choose a scope" looks identical everywhere.
 */

/* Quiet pill trigger — the ONE "pick a value" trigger idiom, shared by the
 * composer's scope/model/mode pills and the search popup's scope pill so
 * "choose a scope" looks identical everywhere. Text-only label + small
 * chevron; state lives in the label, emphasis in none. */
/* `min-w-0` lets a pill yield width in a tight composer bar instead of
 * overflowing the row and clipping the send button — the truncate on each
 * pill's label span does the actual shortening. */
export const pillClass =
  'inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-0.75 text-xs whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:hover:bg-muted enabled:hover:text-foreground disabled:cursor-default';
export const pillLockedClass = 'cursor-default opacity-60';
export const pillChevronClass = '-ml-px size-3 shrink-0 opacity-75';

/* The pill menus' shared row recipe (header line, icon + title + detail
 * rows, accent inset on the active row, trailing check) — the composer's
 * scope/model/mode menus and the search popup's scope menu are one
 * construction with different options. */
export const menuHeadClass = 'flex flex-col items-start gap-0.5 px-2 pt-1 pb-2 text-sm';
/* Quiet section label INSIDE a menu ("Folders", "Subfolders") — grouping
 * without a hairline: a hard separator right under the default row cuts
 * the menu in half; a muted label groups the list instead. */
export const menuSectionClass = 'px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground';
export const optClass =
  'flex w-full cursor-pointer items-start gap-2.5 rounded-md border-0 bg-transparent p-2 text-left text-foreground hover:bg-muted data-focused:bg-muted data-highlighted:bg-muted';
/* Active row = neutral selected surface + trailing accent check, two
 * signals only — accent never becomes a row-width wash (visual-style:
 * selection surfaces are quiet neutrals one step past hover; hue stays
 * on button-level elements like the check). */
export const optActiveClass =
  'bg-active hover:bg-active data-focused:bg-active data-highlighted:bg-active';
export const optIconClass = 'mt-px size-4 shrink-0 text-muted-foreground';
export const optTextClass = 'flex min-w-0 flex-1 flex-col gap-0.5';
export const optTitleClass = 'text-sm font-medium';
export const optDescClass = 'text-xs leading-snug text-muted-foreground';
export const optCheckClass = 'mt-0.5 size-4 shrink-0 text-accent';
