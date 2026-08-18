import { useEffect, useRef, useState } from 'react';
import { api } from '@/common/api/api';
import { electronBridge } from '@/common/lib/electronBridge';
import { basename } from '@/common/lib/paths';
import { useStateWithRef } from '@/common/hooks/useStateWithRef';
import { mergeAttachments, readImageDims } from '@/features/agent-panel/lib/attachments';
import type { Attachment } from '@/features/agent-panel/lib/types';

const ATTACH_MAX_FILES = 50;
const ATTACH_MAX_BYTES = 64 * 1024 * 1024;
const ATTACH_TIMEOUT_MS = 60_000;

/** Composer attachment chips (context files): OS-file upload, sidebar-file
 *  reference, removal, and paste-to-attach. Lifted out of AgentView so a
 *  panel-wide drop, the composer `+`, and the send path all share one list
 *  without AgentView itself owning the upload/preview-URL bookkeeping.
 *
 *  `toast` is passed in rather than read from a shared context so this hook
 *  stays independently testable; `onPasted` is a thin AgentView-owned hook
 *  for the clipboard-image-handled signal, kept here because it must fire in
 *  the same call as the upload it's guarding. */
export function useAgentAttachments({ toast }: { toast: (message: string, opts?: { level?: 'info' | 'success' | 'warning' | 'error' }) => string }) {
  const mountedRef = useRef(true);
  const attachmentPreviewUrlsRef = useRef(new Set<string>());
  const uploadCountRef = useRef(0);
  const [attachments, setAttachments, attachmentsRef] = useStateWithRef<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  function releaseAllAttachmentPreviews() {
    for (const url of attachmentPreviewUrlsRef.current) URL.revokeObjectURL(url);
    attachmentPreviewUrlsRef.current.clear();
  }

  useEffect(() => {
    // Fast Refresh runs an effect cleanup before reapplying it while keeping
    // refs and state. Re-arm this guard on every mount so a live attachment
    // upload can settle instead of leaving the composer on "Uploading…".
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseAllAttachmentPreviews();
    };
  }, []);

  /** Attach OS files (dropped from Finder or picked via `+`) as transient
   *  context: they're written to a temp dir OUTSIDE the folder (so they
   *  never enter the library / file tree / index) and referenced by absolute
   *  path, which the agent reads. */
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    const eligible = files.slice(0, ATTACH_MAX_FILES).filter((f) => f.size <= ATTACH_MAX_BYTES);
    const skipped = files.length - eligible.length;
    if (skipped > 0) {
      toast(`${skipped} file(s) were not attached because they are too large or exceed the batch limit.`, { level: 'warning' });
    }
    if (eligible.length === 0) return;
    uploadCountRef.current += 1;
    setUploading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ATTACH_TIMEOUT_MS);
    try {
      const result = await api.attachFiles(eligible, { signal: controller.signal });
      if (!mountedRef.current) return;
      // `result.files` is 1:1 with `files` (server preserves order). Keep a
      // renderer-local preview URL for image thumbnails; only the returned
      // temp path becomes Agent context.
      const entries = result.files ?? [];
      const added: Attachment[] = [];
      let failed = 0;
      for (let i = 0; i < entries.length; i++) {
        const r = entries[i];
        if (r.error || !r.path) { failed++; continue; }
        const orig = eligible[i];
        const previewUrl = orig && orig.type.startsWith('image/') ? URL.createObjectURL(orig) : undefined;
        if (previewUrl) attachmentPreviewUrlsRef.current.add(previewUrl);
        const dims = orig && orig.type.startsWith('image/') ? await readImageDims(orig) : undefined;
        added.push({ path: r.path, name: r.name, dims, previewUrl });
      }
      if (!mountedRef.current) {
        for (const attachment of added) {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        }
        return;
      }
      if (added.length) setAttachments((a) => mergeAttachments(a, added));
      if (failed) toast(`${failed} file(s) failed to attach.`, { level: 'error' });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      toast(aborted ? 'Attach timed out.' : 'Attach failed.', { level: 'error' });
    } finally {
      window.clearTimeout(timeout);
      uploadCountRef.current = Math.max(0, uploadCountRef.current - 1);
      if (mountedRef.current) setUploading(uploadCountRef.current > 0);
    }
  }

  function pasteImages(files: File[]) {
    // The native watcher independently observes screenshots. Mark this
    // explicit composer paste first so it cannot surface later as a library
    // import prompt once focus leaves the input.
    electronBridge()?.markCurrentClipboardImageHandled?.();
    void uploadFiles(files);
  }

  /** Add chips for files already in the session's folder (dragged from the
   *  sidebar); no upload needed — just reference their existing path.
   *  `knownFilePaths` is the caller's current mention/session listing —
   *  passed in per-call rather than captured, since it depends on session
   *  scope state this hook doesn't own. */
  function addFolderFiles(paths: string[], knownFilePaths: Set<string>) {
    const clean = paths.filter((p) => p && knownFilePaths.has(p));
    const skipped = paths.filter((p) => p && !knownFilePaths.has(p)).length;
    if (skipped) toast("Only files from this chat's folder can be attached.", { level: 'warning' });
    const add = clean.map((p) => ({ path: p, name: basename(p) }));
    if (add.length) setAttachments((a) => mergeAttachments(a, add));
  }

  function removeAttachment(path: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.path === path);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        attachmentPreviewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.path !== path);
    });
  }

  function clearComposerAttachments() {
    // Sent and queued turns retain their image thumbnail in the transcript.
    // The URL remains owned by the panel until its transcript is replaced.
    setAttachments([]);
  }

  /** Session-reset variant: revokes preview URLs too. Only safe when the
   *  transcript that may still show the same thumbnails is being cleared or
   *  replaced in the same reset (a fatal reconnect / terminal close instead
   *  keep the composer intact and never call this). */
  function discardAttachmentsForReset() {
    releaseAllAttachmentPreviews();
    setAttachments([]);
  }

  return {
    attachments,
    attachmentsRef,
    uploading,
    uploadFiles,
    pasteImages,
    addFolderFiles,
    removeAttachment,
    clearComposerAttachments,
    discardAttachmentsForReset,
  };
}
