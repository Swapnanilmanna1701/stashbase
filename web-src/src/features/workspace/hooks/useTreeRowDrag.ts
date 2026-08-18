import { useState, type DragEvent } from 'react';
import { FILE_MIME, FOLDER_MIME } from '@/common/lib/dragMime';
import { useAppActions } from '@/store/contexts/AppContext';

/** Where in a row the cursor is during dragover — drives the drop
 *  indicator + the action the drop triggers. `into` is folder-only
 *  (move the dragged file/folder into that folder); `above` / `below`
 *  are reorder slots (same parent only). */
export type DropEdge = 'above' | 'into' | 'below' | null;

/** Breadcrumbs the drag source writes at `dragstart` so drop targets can
 *  verify "same parent" / "not yourself" without resorting to MIME data
 *  (`dataTransfer.getData` is unreadable during `dragover`). One
 *  module-level record — a window has at most one drag in flight.
 *  Cleared on `dragend`. */
const dragSource: {
  parent: string | null;
  name: string | null;
  kind: 'file' | 'folder' | null;
} = { parent: null, name: null, kind: null };

/** Reorder helper: produce a new array where `dragName` lands at the
 *  position of `dropName` (above or below it). Used for the manual
 *  sidebar ordering optimistic update. */
function reorder(
  names: string[],
  dragName: string,
  dropName: string,
  edge: 'above' | 'below',
): string[] {
  const without = names.filter((n) => n !== dragName);
  const dropIdx = without.indexOf(dropName);
  if (dropIdx < 0) return names; // dropName not in current list — bail
  const insertAt = edge === 'above' ? dropIdx : dropIdx + 1;
  return [...without.slice(0, insertAt), dragName, ...without.slice(insertAt)];
}

/** Drag/drop behavior for one tree row — the single factory both row
 *  kinds share. Owns the row's `dropEdge` state and returns the DOM
 *  handlers to spread on the row element. Kind decides the dragstart
 *  payload and the dragover zones (folders offer above/into/below,
 *  files above/below only); the drop actions are common. */
export function useTreeRowDrag({
  kind,
  path,
  name,
  parent,
  siblings,
}: {
  kind: 'file' | 'folder';
  /** Folder-relative path of this row — drag payload and `into` target. */
  path: string;
  /** Row basename — the drop name the reorder splice lands on. */
  name: string;
  /** Parent folder path (`''` at folder root). */
  parent: string;
  /** Rendered sibling basenames for this level (manual order + tail). */
  siblings: string[];
}): {
  dropEdge: DropEdge;
  dragProps: {
    onDragStart: (e: DragEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
  };
} {
  const { actions } = useAppActions();
  const [dropEdge, setDropEdge] = useState<DropEdge>(null);

  const isDragSource = () =>
    dragSource.kind === kind && dragSource.name === name && dragSource.parent === parent;

  function computeEdge(e: DragEvent<HTMLDivElement>, isFile: boolean, isFolder: boolean): DropEdge {
    if (kind === 'file') {
      // File rows accept above/below only. For file drags across folders,
      // above/below means "move to this row's parent at this level".
      if (dragSource.parent !== parent && !isFile) return null;
      // Self → skip.
      if (isDragSource()) return null;
      const rect = e.currentTarget.getBoundingClientRect();
      const r = (e.clientY - rect.top) / rect.height;
      return r < 0.5 ? 'above' : 'below';
    }
    // Self → no indicator.
    if (isDragSource()) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;
    // Folder zones: 0–25% = above, 25–75% = into, 75–100% = below.
    let edge: DropEdge = r < 0.25 ? 'above' : r >= 0.75 ? 'below' : 'into';
    // Above/below means "same level as this row" even when dragging a
    // file across folders. Middle still means "move into this folder".
    if ((edge === 'above' || edge === 'below') && dragSource.parent !== parent && isFolder) {
      edge = null;
    }
    if (edge === 'into' && isFolder) edge = null;
    return edge;
  }

  function onDragStart(e: DragEvent<HTMLDivElement>) {
    if (kind === 'folder') {
      e.stopPropagation();
      e.dataTransfer.setData(FOLDER_MIME, path);
    } else {
      e.dataTransfer.setData(FILE_MIME, path);
      e.dataTransfer.setData('text/plain', path);
    }
    e.dataTransfer.effectAllowed = 'move';
    dragSource.parent = parent;
    dragSource.name = name;
    dragSource.kind = kind;
  }
  function onDragEnd() {
    dragSource.parent = null;
    dragSource.name = null;
    dragSource.kind = null;
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    const t = e.dataTransfer.types;
    const isFile = t.includes(FILE_MIME);
    const isFolder = t.includes(FOLDER_MIME);
    if (!isFile && !isFolder) return; // external OS drop → global handler
    e.preventDefault();
    e.stopPropagation();
    const edge = computeEdge(e, isFile, isFolder);
    setDropEdge(edge);
    e.dataTransfer.dropEffect = edge ? 'move' : 'none';
  }
  function onDragLeave() { setDropEdge(null); }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    // External OS file drops aren't ours — let them bubble to the
    // window-level importer (`useGlobalDragDrop`), which targets the
    // folder under the cursor via `closest('.tree-row.folder')` /
    // `#sideHead`. Unconditionally stopping propagation here is what
    // made drops landing on a row silently fail. Only internal
    // move/reorder drags are handled below.
    const t = e.dataTransfer.types;
    if (!t.includes(FILE_MIME) && !t.includes(FOLDER_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    const edge = dropEdge;
    setDropEdge(null);
    if (!edge) return;
    if (edge === 'into') {
      // Folder rows only — file rows never compute an `into` edge.
      if (kind !== 'folder') return;
      const filePath = e.dataTransfer.getData(FILE_MIME);
      if (filePath) void actions.moveFile(filePath, path);
      return;
    }
    if (!dragSource.name) return;
    // Captured now: `dragend` clears the shared record as soon as the
    // drag operation ends, which is before the async move settles.
    const dragName = dragSource.name;
    if (dragSource.parent !== parent) {
      const filePath = e.dataTransfer.getData(FILE_MIME);
      if (!filePath || dragSource.kind !== 'file') return;
      const slot = edge;
      void (async () => {
        const moved = await actions.moveFile(filePath, parent);
        if (!moved) return;
        const next = reorder(siblings, dragName, name, slot);
        await actions.setFolderOrder(parent, next);
      })();
      return;
    }
    const next = reorder(siblings, dragName, name, edge);
    void actions.setFolderOrder(parent, next);
  }

  return { dropEdge, dragProps: { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } };
}
