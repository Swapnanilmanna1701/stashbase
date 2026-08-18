import { useCallback } from 'react';
import { electronBridge } from '@/common/lib/electronBridge';

/** Opening a member folder in its own native window. The capability flag
 *  and the action come from the same bridge read so a caller cannot offer
 *  the menu item in the browser build and then fail on click; the toast
 *  covers the race where the bridge disappears between the two. */
export function useOpenFolderWindow(
  toast: (message: string, opts?: { level?: 'info' | 'success' | 'warning' | 'error' }) => void,
): { canOpenInNewWindow: boolean; openInNewWindow: (path: string) => void } {
  const bridge = electronBridge();

  const openInNewWindow = useCallback((path: string) => {
    void (async () => {
      const opened = await bridge?.openFolderWindow?.(path);
      if (!opened) {
        toast('New window is only available in the desktop app.', { level: 'error' });
      }
    })();
  }, [bridge, toast]);

  return { canOpenInNewWindow: !!bridge?.openFolderWindow, openInNewWindow };
}
