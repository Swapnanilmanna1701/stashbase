/**
 * Public surface of the Documents feature.
 *
 * `DocumentViewer` is the entry point: one component that owns the
 * file-format → viewer dispatch and every viewer's lazy boundary, so a
 * new format never reaches the composition root. The per-format viewers
 * are deliberately NOT exported — they are reachable only through the
 * dispatch, which is what keeps their chunks off the initial load.
 *
 * The other three are shell-level seams: an always-mounted history
 * overlay, the preview-iframe message bridge the shell installs once, and
 * the chord predicate the shell's global keydown listener asks.
 */
export { DocumentViewer } from '@/features/documents/components/DocumentViewer';
export { EditorHistoryNavigator } from '@/features/documents/components/EditorHistoryNavigator';
export { usePreviewMessages } from '@/features/documents/hooks/usePreviewMessages';
export { isEditorHistoryChord } from '@/features/documents/lib/editorHistory';
