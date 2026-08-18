import { useEffect, useRef } from 'react';
import { useAppActions } from '@/store/contexts/AppContext';

/** Inline input for naming a new folder. Mounts inside the parent
 *  folder's children area (or at the top level when `parentPath`
 *  is `''`), so the affordance reads "the new folder will live
 *  here". Same Enter/Esc/blur/IME semantics as `<RenameInput>`. */
export function NewFolderInput({ parentPath, depth }: { parentPath: string; depth: number }) {
  const { actions, dispatch } = useAppActions();
  const ref = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useEffect(() => { ref.current?.focus(); }, []);

  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    const name = ref.current?.value.trim() ?? '';
    dispatch({ type: 'NEW_FOLDER_INPUT', open: false });
    if (!name) return;
    const full = parentPath ? `${parentPath}/${name}` : name;
    void actions.newFolder(full);
  }
  function cancel() {
    if (doneRef.current) return;
    doneRef.current = true;
    dispatch({ type: 'NEW_FOLDER_INPUT', open: false });
  }

  return (
    <div
      className="tree-row folder new-folder-row"
      style={{ paddingLeft: depth * 14 + 26 }}
    >
      <span className="chev new-folder-spacer" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        aria-label={parentPath ? `New folder in ${parentPath}` : 'New folder in folder root'}
        className="tree-create-input"
        placeholder="New folder name…"
        onKeyDown={(e) => {
          // Skip while IME is composing — Chinese / Japanese / Korean
          // users press Enter to pick a candidate, not to commit.
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onBlur={() => {
          if (doneRef.current) return;
          const name = ref.current?.value.trim() ?? '';
          if (name) commit(); else cancel();
        }}
      />
    </div>
  );
}
