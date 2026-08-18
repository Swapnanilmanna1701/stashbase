import { api } from '@/common/api/api';
import { portableImageMarkdownPath, relativeAssetPath } from '@/features/documents/milkdown/paths';

/**
 * Save an image the user dropped or pasted into a note, and return the
 * Markdown path that points at it.
 *
 * The file lands beside the note rather than in a shared assets folder, and
 * the returned path is relative to the note, so moving or syncing the pair
 * keeps the link intact. Milkdown takes the resolved string as the image
 * node's src, so a failed save must reject rather than return a broken path.
 */
export async function uploadLocalImage(file: File, noteName: string): Promise<string> {
  const parts = noteName.split('/');
  parts.pop();
  const dir = parts.join('/');
  const result = await api.upload([{ file, relPath: file.name }], dir);
  const saved = result.files[0];
  if (!saved || saved.error) throw new Error(saved?.error ?? 'The image could not be saved.');
  const relative = relativeAssetPath(noteName, saved.file);
  return portableImageMarkdownPath(relative);
}
