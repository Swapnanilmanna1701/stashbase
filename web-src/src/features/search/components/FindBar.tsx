import { useEffect, useRef } from 'react';
import { useAppActions, useUiShell, useWorkspace } from '@/store/contexts/AppContext';
import { openLibrarySearch } from '@/common/lib/librarySearchTrigger';
import { Button } from '@/common/components/ui/button';
import { Input } from '@/common/components/ui/input';

/**
 * Chrome-style in-document find bar. Floats over the top-right of the
 * main pane. Whichever view is below (CM editor / MD preview iframe /
 * HTML preview iframe) supplies a `FindController` via the AppContext;
 * this component is purely UI + keyboard, never reads the underlying
 * document directly.
 *
 * Hotkey contract:
 *   - Cmd+F            → opens this bar (handled in Hotkeys.tsx). When
 *                        already open, re-focuses + selects the input.
 *   - Enter            → next match (Shift+Enter = prev). Implemented
 *                        here so it works without leaving the input.
 *   - Esc              → close.
 *   - Cmd+G / S-Cmd+G  → next/prev. Handled in Hotkeys.tsx so it
 *                        also works from editor / sidebar focus.
 */

/** Aa / Word latch buttons — ghost until pressed, then the accent state
 *  ladder (thin accent stroke + tinted fill) driven off aria-pressed. */
const FIND_TOGGLE_CLASS =
  'px-1.5 font-semibold tracking-wide text-muted-foreground aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent';

export function FindBar() {
  const { find } = useUiShell();
  const { folderPath } = useWorkspace();
  const { actions } = useAppActions();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-focus on every open transition — Cmd+F'ing while the bar is
  // already open re-runs `openFind` (no-op state) but bumps a render,
  // and that render lands here. The select() lets the user retype on
  // top of the prior query without a clear step.
  useEffect(() => {
    if (!find.open) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [find.open]);

  if (!find.open) return null;

  const { query, caseSensitive, wholeWord, current, total } = find;
  const hasQuery = query.length > 0;
  const noMatch = hasQuery && total === 0;

  /** Escalate find-in-document to the search popup, carrying the query
   *  over. This bar's Aa / Word latches stay behind: the popup has no such
   *  controls, so sending them would leave it matching by rules the user
   *  can neither see nor undo there. Folder scope: "all files" here means
   *  the files around this document, not the whole library. */
  function searchAllFiles() {
    const q = query.trim();
    if (!q) return;
    openLibrarySearch({
      query: q,
      mode: 'keyword',
      scope: folderPath ? { kind: 'folder', path: folderPath } : { kind: 'library' },
    });
  }

  return (
    <div
      /* Sits at the top of the document area, just below the back/forward
       * + breadcrumb + edit-toggle chrome row (which itself sits at
       * `top: 44px`). Right-aligned to mirror Chrome's placement and so
       * it doesn't fight the centered breadcrumb. */
      className="absolute top-[78px] right-3.5 z-10 flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1 shadow-elevation"
      role="search"
      aria-label="Find in document"
    >
      <Input
        ref={inputRef}
        className={
          'h-6 w-45 px-1.5 text-sm' +
          (noMatch ? ' border-destructive text-destructive' : '')
        }
        type="text"
        placeholder="Find"
        value={query}
        onChange={(e) => actions.setFindQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) actions.findPrev(); else actions.findNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            actions.closeFind();
          }
        }}
      />
      <span className="min-w-9.5 px-1 text-right text-xs text-muted-foreground tabular-nums">
        {hasQuery ? (total === 0 ? '0/0' : `${current || '?'}/${total}`) : ''}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className={FIND_TOGGLE_CLASS}
        title="Match case"
        aria-pressed={caseSensitive}
        onClick={() => actions.toggleFindCaseSensitive()}
      >
        Aa
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className={FIND_TOGGLE_CLASS}
        title="Whole word"
        aria-pressed={wholeWord}
        onClick={() => actions.toggleFindWholeWord()}
      >
        Word
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="px-1.5 font-normal whitespace-nowrap text-muted-foreground"
        title="Search all files"
        disabled={!hasQuery}
        onClick={searchAllFiles}
      >
        All files
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        title="Previous (Shift+Enter)"
        disabled={total === 0}
        onClick={() => actions.findPrev()}
      >
        <svg className="size-3.5" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        title="Next (Enter)"
        disabled={total === 0}
        onClick={() => actions.findNext()}
      >
        <svg className="size-3.5" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        title="Close (Esc)"
        onClick={() => actions.closeFind()}
      >
        <svg className="size-3.5" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </Button>
    </div>
  );
}
