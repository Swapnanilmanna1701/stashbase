/**
 * Shared chrome for the lightweight topmost pickers — Quick Open and the
 * Editor History navigator. Both use one restrained modal palette; Editor
 * History is just narrower and skips the input row (no query, just a
 * hold-to-cycle list). Selection paints via `aria-selected`, so the
 * ARIA state and the visual state can never drift apart — a quiet
 * neutral surface (`bg-active`), never an accent wash.
 */
import { emptyStateClass } from '@/common/lib/emptyState';

export const PICKER_VEIL_CLASS =
  'fixed inset-0 z-1200 flex items-start justify-center bg-veil-quiet pt-[min(18vh,150px)]';

export function pickerPanelClass(width: 'wide' | 'narrow'): string {
  return (
    'overflow-hidden rounded-lg border border-border bg-card shadow-elevation ' +
    (width === 'wide'
      ? 'w-[min(680px,calc(100vw-32px))] max-h-[min(480px,calc(100vh-64px))]'
      : 'w-[min(420px,calc(100vw-32px))] max-h-[min(420px,calc(100vh-64px))] outline-none')
  );
}

export const PICKER_LABEL_CLASS = 'px-3.75 pt-1.75 pb-0.75 text-sm text-muted-foreground';

export const PICKER_RESULTS_CLASS = 'm-0 max-h-95 list-none overflow-auto p-1.25';

export const PICKER_ROW_CLASS =
  'group flex cursor-default justify-between gap-5 rounded-md px-2.5 py-1.75 aria-selected:bg-active';

/** The muted right-hand detail (`<small>`) inside a result row. */
export const PICKER_ROW_DETAIL_CLASS =
  'overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground';

export const PICKER_EMPTY_ROW_CLASS = emptyStateClass;
