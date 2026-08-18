import { useEffect, useLayoutEffect, useRef } from 'react';
import { useUiShell } from '@/store/contexts/AppContext';

/**
 * Inline VS-Code-style rename — replaces a row's `.label` span with an
 * editable input. Enter commits, Esc cancels, blur commits.
 *
 * The click-propagation guard (mousedown/click/dblclick stopPropagation
 * via `onMouseDown` etc) is critical: without it, clicking inside the
 * field to move the cursor would fire the row's own click handler,
 * trigger a state change, re-render the tree, and yank the input out
 * of the DOM mid-edit.
 *
 * For file renames the extension is split off into a muted span pinned
 * to the right — the user can't accidentally turn an `.md` note into
 * something the rest of the pipeline can't open.
 */
export function RenameInput({
  initialBasename,
  ext,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initialBasename: string;
  /** Extension WITH leading dot (e.g. `.md`). Empty string for folders. */
  ext: string;
  ariaLabel: string;
  onCommit: (newBasename: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Click-propagation guard. Attach via native API so we get a
  // pre-React-event hook into the parent row.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('mousedown', stop);
    el.addEventListener('click', stop);
    el.addEventListener('dblclick', stop);
    return () => {
      el.removeEventListener('mousedown', stop);
      el.removeEventListener('click', stop);
      el.removeEventListener('dblclick', stop);
    };
  }, []);

  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    const raw = ref.current?.value.trim() ?? '';
    if (!raw || raw === initialBasename) {
      onCancel();
      return;
    }
    onCommit(raw);
  }

  function cancel() {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }

  return (
    <span
      className="flex min-w-0 flex-1 items-center rounded-md border border-accent bg-background text-base"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        type="text"
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-0 bg-transparent py-0.5 pr-0 pl-1.5 text-left text-inherit [font:inherit] outline-none"
        defaultValue={initialBasename}
        onKeyDown={(e) => {
          // Ignore Enter while an IME composition is active — Chinese /
          // Japanese / Korean users press Enter to confirm candidate
          // selection, and we'd otherwise commit the rename mid-word.
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onBlur={commit}
      />
      {ext && <span className="py-0.5 pr-1.5 whitespace-nowrap text-muted-foreground select-none">{ext}</span>}
    </span>
  );
}

/** Hook returning the in-progress rename target (if any) for a given
 *  path + kind. Components use it to swap a `.label` for a `<RenameInput>`. */
export function useRenameTarget(path: string, kind: 'file' | 'folder'): boolean {
  const { renaming } = useUiShell();
  return renaming?.path === path && renaming.kind === kind;
}
