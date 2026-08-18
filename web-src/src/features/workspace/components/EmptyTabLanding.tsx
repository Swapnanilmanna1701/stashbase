import { useAppActions } from '@/store/contexts/AppContext';

/**
 * Obsidian-style landing inside a blank `+` tab — three vertically-
 * stacked shortcut links centered in the document area. All wiring goes
 * through stable AppContext actions (no DOM queries here), so this
 * component is a pure render of the available actions.
 */
const ACTION_CLASS =
  'inline-flex cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-1 text-base font-medium hover:bg-muted [&_kbd]:[font-family:inherit] [&_kbd]:text-sm [&_kbd]:font-normal [&_kbd]:tracking-wide [&_kbd]:text-muted-foreground';

export function EmptyTabLanding() {
  const { actions } = useAppActions();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-10">
      <button
        type="button"
        className={`${ACTION_CLASS} text-accent`}
        onClick={() => { void actions.newNote(); }}
      >
        Create new note <kbd>⌘N</kbd>
      </button>
      <button
        type="button"
        className={`${ACTION_CLASS} text-accent`}
        onClick={() => { window.dispatchEvent(new Event('stashbase-open-quick-open')); }}
      >
        Open notes <kbd>⌘O</kbd>
      </button>
      <button
        type="button"
        className={`${ACTION_CLASS} text-muted-foreground hover:text-foreground`}
        onClick={() => { void actions.closeActiveTab(); }}
      >
        Close tab
      </button>
    </div>
  );
}
