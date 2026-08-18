/**
 * Public surface of the Workspace feature — the folder/tab/library
 * chrome the shell lays out around a document.
 *
 * `workspace.css` rides the barrel because every surface below is styled
 * by it and none of them is optional; importing the barrel is what puts
 * the stylesheet in the graph, so no consumer has to remember it.
 *
 * Everything here is eager on purpose: each surface is either always
 * mounted (splitters, folder switcher) or mounted the moment the window
 * resolves its folder state (the zero-folder landing, the file tree) or
 * opens a tab, so a lazy boundary would only add a flash.
 */
import './workspace.css';

export { EmptyTabLanding } from '@/features/workspace/components/EmptyTabLanding';
export { FileTree } from '@/features/workspace/components/FileTree';
export { FolderMenu } from '@/features/workspace/components/FolderMenu';
export { FolderSwitcher } from '@/features/workspace/components/FolderSwitcher';
export { RemoveFolderModal } from '@/features/workspace/components/RemoveFolderModal';
export { TabStrip } from '@/features/workspace/components/TabStrip';
export { ChatSplitter, SidebarSplitter } from '@/features/workspace/components/WorkspaceSplitters';
export { ZeroFolderState } from '@/features/workspace/components/ZeroFolderState';

export { useFolderFavorite } from '@/features/workspace/hooks/useFolderFavorite';
export { useFolderRemoval } from '@/features/workspace/hooks/useFolderRemoval';
export { useGlobalDragDrop } from '@/features/workspace/hooks/useGlobalDragDrop';
export { useLibraryReconcile } from '@/features/workspace/hooks/useLibraryReconcile';
export { useOpenFolderWindow } from '@/features/workspace/hooks/useOpenFolderWindow';

/* `refreshLibraryMembership` (lib/libraryMembership.ts) is deliberately
 * absent: the membership resync is a consequence of a folder mutation,
 * never a step a caller sequences itself, so the hooks above own it and
 * the shell reaches it only by using one of them. */
