import { useEffect, useState } from 'react';
import { getWindowId } from '@/common/api/api';
import { openExternalUrl } from '@/common/lib/externalLink';
import { isTrustedPreviewSource } from '@/features/documents/lib/previewMessages';
import { useAppActions } from '@/store/contexts/AppContext';

/**
 * Bridge from sandboxed preview iframes to the shell. Previews post
 * `stashbase-nav` (cross-file link clicks), `stashbase-preview-image`
 * (lightbox requests), and `stashbase-open-external` messages; only trusted
 * preview sources are honored. Owns the shell's image-lightbox request state.
 */
export function usePreviewMessages(): {
  previewImage: { src: string; alt: string } | null;
  closePreviewImage: () => void;
} {
  const { actions } = useAppActions();
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data) return;
      const type = typeof e.data.type === 'string' ? e.data.type : '';
      const previewMessage =
        type === 'stashbase-nav' ||
        type === 'stashbase-preview-image' ||
        type === 'stashbase-open-external';
      if (previewMessage && !isTrustedPreviewSource(e.source)) return;
      if (type === 'stashbase-nav') {
        const path = typeof e.data.path === 'string' ? e.data.path : '';
        const anchor = typeof e.data.anchor === 'string' && e.data.anchor ? e.data.anchor : undefined;
        const folder = typeof e.data.folder === 'string' && e.data.folder ? e.data.folder : undefined;
        if (!path) return;
        // `folder` = a link inside an out-of-folder document; the target
        // stays in that member folder (validated server-side on fetch).
        if (folder) void actions.openLibraryFile(folder, path, { anchor });
        else void actions.navigateTo(path, anchor);
        return;
      }
      if (type === 'stashbase-preview-image') {
        const raw = typeof e.data.src === 'string' ? e.data.src : '';
        try {
          const url = new URL(raw, window.location.href);
          if (
            url.protocol === 'http:' ||
            url.protocol === 'https:' ||
            url.protocol === 'data:' ||
            url.protocol === 'blob:'
          ) {
            setPreviewImage({
              src: url.href,
              alt: typeof e.data.alt === 'string' ? e.data.alt : '',
            });
          }
        } catch {
          // Ignore malformed image preview payloads.
        }
        return;
      }
      if (type !== 'stashbase-open-external') return;
      const href = typeof e.data.href === 'string' ? e.data.href : '';
      try {
        const url = new URL(href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
        // Same-origin asset links (e.g. a recording's webm, opened in the
        // system browser to play) need the window's folder context — the
        // browser can't send our header, so carry the windowId in the
        // query the way `assetUrl` does. Without it the server has no open
        // folder for the request and answers NO_FOLDER.
        if (url.origin === window.location.origin && url.pathname.startsWith('/asset/')
          && !url.pathname.startsWith('/asset/__window/')
          && !url.searchParams.has('windowId')) {
          url.searchParams.set('windowId', getWindowId());
        }
        openExternalUrl(url.href);
      } catch {
        // Ignore malformed messages from sandboxed preview content.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [actions]);

  function closePreviewImage() {
    setPreviewImage(null);
  }

  return { previewImage, closePreviewImage };
}
