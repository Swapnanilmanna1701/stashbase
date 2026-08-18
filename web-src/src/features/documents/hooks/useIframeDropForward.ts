import { useEffect, type RefObject } from 'react';

/**
 * Forward OS-file drops out of a same-origin preview iframe. The iframe
 * swallows drag events, so the window-level listeners in
 * `useGlobalDragDrop` never fire while the cursor is over the preview
 * area; this attaches to the iframe's contentDocument and relays drops
 * as a `stashbase:iframe-drop` CustomEvent on `window` (which
 * `useGlobalDragDrop` listens for).
 *
 * Shared by document iframe previews (srcDoc) and HtmlPreview (/asset/*
 * iframe) — both sandboxes carry `allow-same-origin`, so the parent can
 * reach the contentDocument directly. `reattachKey` re-runs the effect
 * when the iframe's content identity changes (srcDoc html / asset src);
 * the `load` listener inside covers reloads within one key.
 */
export function useIframeDropForward(
  frameRef: RefObject<HTMLIFrameElement | null>,
  reattachKey: unknown,
): void {
  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;
    let installedDoc: Document | null = null;

    function iframeDragOver(e: Event) {
      const de = e as DragEvent;
      if (de.dataTransfer?.types.includes('Files')) de.preventDefault();
    }
    function iframeDrop(e: Event) {
      const de = e as DragEvent;
      if (!de.dataTransfer?.types.includes('Files')) return;
      de.preventDefault();
      de.stopPropagation();
      // Collect entries synchronously before any await — Chromium
      // invalidates DataTransfer.items on the first await.
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < (de.dataTransfer.items?.length ?? 0); i++) {
        const entry = de.dataTransfer.items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      window.dispatchEvent(
        new CustomEvent('stashbase:iframe-drop', { detail: { entries } }),
      );
    }

    function attach() {
      const doc = iframe?.contentDocument;
      if (!doc || installedDoc === doc) return;
      installedDoc = doc;
      doc.addEventListener('dragover', iframeDragOver);
      doc.addEventListener('drop', iframeDrop);
    }

    iframe.addEventListener('load', attach);
    if (iframe.contentDocument?.readyState === 'complete') attach();
    return () => {
      iframe.removeEventListener('load', attach);
      installedDoc?.removeEventListener('dragover', iframeDragOver);
      installedDoc?.removeEventListener('drop', iframeDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reattachKey]);
}
