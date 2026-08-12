import path from 'node:path';
import { VIEWABLE_FILE_EXTENSIONS } from '../shared/file-formats.ts';
import { isTransientAttachmentPath, transientAttachmentPreviewUrl } from './routes/attach.ts';

export interface RestoredAttachment {
  path: string;
  name: string;
  /** Present only for a transient image restored as a thumbnail. A non-image
   * document card carries no preview URL — it displays a name and grants no
   * read access. */
  previewUrl?: string;
}

/** Rehydrate the generated `Attached files:` suffix into UI attachment data
 * when replaying either supported Agent runtime's persisted transcript, so a
 * file the user attached reads as ONE chip rather than a chip PLUS its raw
 * path leaking back into the shown message. Images become transient
 * thumbnails (transient-only, so an arbitrary image path never gains a preview
 * URL); other known document types become plain name-only cards. A line we
 * cannot classify stays in the text, untouched. */
export function restoreHistoryAttachments(text: string): { text: string; attachments: RestoredAttachment[] } {
  const marker = '\n\nAttached files:\n';
  const offset = text.lastIndexOf(marker);
  if (offset < 0) return { text, attachments: [] };
  const before = text.slice(0, offset);
  const attachments: RestoredAttachment[] = [];
  const remaining = text.slice(offset + marker.length).split('\n').filter((line) => {
    if (!line.startsWith('- ')) return true;
    const attachment = historyAttachment(line.slice(2));
    if (!attachment) return true;
    attachments.push(attachment);
    return false;
  });
  return { text: remaining.length ? `${before}${marker}${remaining.join('\n')}` : before, attachments };
}

/** Classify one `- ` line of the attachment suffix. A derived-file line carries
 * a trailing `(for text context, …)` hint after the path, so read the path up
 * to that. Returns null for a line we should leave in the prose. */
function historyAttachment(rest: string): RestoredAttachment | null {
  const cut = rest.indexOf(' (');
  const candidate = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
  if (!candidate) return null;
  if (isPreviewableImage(candidate)) return historyImageAttachment(candidate);
  if (isKnownDocument(candidate)) return { path: candidate, name: path.basename(candidate) };
  return null;
}

/** Build a preview only for an image written by StashBase's transient upload
 * route. Transcript text must never grant read access to arbitrary paths. */
export function historyImageAttachment(candidate: string): RestoredAttachment | null {
  if (!isTransientAttachmentPath(candidate) || !isPreviewableImage(candidate)) return null;
  return {
    path: candidate,
    name: path.basename(candidate),
    previewUrl: transientAttachmentPreviewUrl(candidate),
  };
}

function isPreviewableImage(filePath: string): boolean {
  return ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'].includes(path.extname(filePath).toLowerCase());
}

/** A non-image file whose extension is in the app's known viewable/attachable
 * vocabulary. Restricting to known types keeps an extension-less or unknown
 * path (e.g. `/etc/passwd`) in the prose instead of lifting it into a card —
 * a card grants no read access regardless, but a genuine attachment always
 * carries a recognised extension. */
function isKnownDocument(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  return ext.length > 0 && (VIEWABLE_FILE_EXTENSIONS as readonly string[]).includes(ext);
}
