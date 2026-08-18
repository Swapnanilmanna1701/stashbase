/**
 * Drag-and-drop MIME types for intra-app file / folder drags.
 *
 * The renderer writes these on `dragstart` so drop targets can tell an
 * internal tree drag (move / reorder) apart from an external OS file
 * drop (which carries the standard `'Files'` type and is handled by the
 * global drop listener instead). Shared here so the sidebar tree, the
 * sidebar header drop zone, the chat panel drop target, and the global
 * drag-drop hook all agree on one string instead of re-declaring it.
 *
 * Note: `dataTransfer.getData` is unreadable during `dragover` (only the
 * type list is), so cross-row context like "same parent" rides on
 * module-scoped breadcrumbs in `FileTree`, not on a MIME payload.
 */
export const FILE_MIME = 'application/x-stashbase-file';
export const FOLDER_MIME = 'application/x-stashbase-folder';
