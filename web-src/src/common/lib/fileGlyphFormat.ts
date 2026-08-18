import {
  AUDIO_SOURCE_EXTENSIONS, DOCX_EXTENSIONS, HTML_NOTE_EXTENSIONS,
  IMAGE_SOURCE_EXTENSIONS, PDF_EXTENSIONS, STRUCTURED_DATA_EXTENSIONS,
} from '@shared/file-formats';
import type { FileGlyphFormat } from '@/common/components/FileTypeIcon';

/** The muted type glyph + short label for a file, keyed off the filename
 *  extension. One format vocabulary so a PDF reads the same glyph in the
 *  composer, the transcript, library search hits, and the tree — and stays
 *  de-coloured (`FileTypeIcon` renders in `currentColor`), the same
 *  restraint that keeps a column of files quiet. Unknown types fall back to
 *  the generic document glyph and the bare uppercased extension. */
export function fileGlyphFormat(name: string): { format: FileGlyphFormat; label: string } {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const label = ext ? ext.toUpperCase() : 'File';
  if (PDF_EXTENSIONS.includes(ext as never)) return { format: 'pdf', label };
  if (DOCX_EXTENSIONS.includes(ext as never)) return { format: 'docx', label };
  if (HTML_NOTE_EXTENSIONS.includes(ext as never)) return { format: 'html', label };
  if (STRUCTURED_DATA_EXTENSIONS.includes(ext as never)) return { format: 'json', label };
  if (IMAGE_SOURCE_EXTENSIONS.includes(ext as never)) return { format: 'image', label };
  if (AUDIO_SOURCE_EXTENSIONS.includes(ext as never)) return { format: 'audio', label };
  return { format: 'md', label };
}
