/**
 * Shared Tailwind class recipes for agent-panel chrome that more than one
 * agent component renders (header icon buttons, attachment chips). Content
 * typography (.agent-prose), the sticky turn-head system, and the One-Dark
 * code palette intentionally stay in agent-panel.css.
 */
import { cn } from '@/common/lib/utils';
import { buttonVariants } from '@/common/components/ui/button';

/** Small outline / primary actions inside transcript cards — the fatal
 * notices, the inline user-message editor, and the permission ask all use
 * the same pair, so their emphasis cannot drift apart. */
export const outlineSmClass = buttonVariants({ variant: 'outline', size: 'sm' });
export const primarySmClass = buttonVariants({ variant: 'default', size: 'sm' });

/** Accent status dot used by working/queued/running indicators. Render with
 * `aria-hidden` — the adjacent text carries the meaning. */
export const accentDotClass = 'inline-block size-1.75 shrink-0 rounded-full bg-accent';

/** Quiet 28px icon action — pane header buttons and composer bar buttons. */
export const iconGhostButtonClass = cn(
  buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
  'text-muted-foreground',
);

/** Small accent progress arc beside "Connecting to X…" copy — the one
 * connecting-state spinner, shared by the transcript notice and the
 * empty-chat greeting. The global reduced-motion policy zeroes the spin
 * keyframe, leaving a static arc while the adjacent text still conveys
 * the state. Render with `aria-hidden` — the text carries the meaning. */
export const spinnerClass =
  'size-3.5 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent';

/** File attachment card shown in the composer and in sent transcript turns:
 *  a muted type glyph, the filename, and its type label under it (GPT-style
 *  two-line card, kept in the panel's neutral palette). */
export const attachChipClass =
  'inline-flex max-w-72 items-center gap-2 rounded-lg border border-border bg-muted py-1.5 pr-1.5 pl-2 text-xs text-foreground';

/** Neutral rounded tile holding the muted file-type glyph inside the card. */
export const attachIconTileClass =
  'grid size-8 shrink-0 place-items-center rounded-md bg-background text-muted-foreground [&_svg]:size-4';

/** The stacked name + type-label column inside the card. */
export const attachTextClass = 'flex min-w-0 flex-col gap-0.5 leading-tight';

/** The secondary type label (e.g. "PDF") under the filename. */
export const attachTypeClass = 'text-xs uppercase tracking-wide text-muted-foreground';

/** 64px image thumbnail chip (composer removable + transcript static). */
export const attachImageChipClass =
  'relative size-16 overflow-hidden rounded-lg border border-border bg-muted shadow-low';

/** The thumbnail button/img inside an image chip. */
export const attachImagePreviewClass =
  'block h-full w-full cursor-zoom-in border-0 bg-transparent p-0 [&_img]:block [&_img]:h-full [&_img]:w-full [&_img]:object-cover';

/** Floating × on an image chip. */
export const attachImageRemoveClass =
  'absolute top-1 right-1 grid size-4 cursor-pointer place-items-center rounded-full border border-border/80 bg-background/75 p-0 text-foreground [&_svg]:block [&_svg]:size-2.25 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_svg]:[stroke-linecap:round]';

/** Inline × on a text file chip. */
export const attachRemoveClass =
  'grid size-4 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-lg leading-none text-muted-foreground hover:bg-active hover:text-foreground';

export const attachNameClass = 'overflow-hidden text-ellipsis whitespace-nowrap font-medium';
