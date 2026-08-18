import { useEffect, useRef, useState } from 'react';
import { useSettingsBlocking } from '@/common/hooks/useSettingsBlocking';
import { useUiShell } from '@/store/contexts/AppContext';
import { OPEN_LIBRARY_SEARCH_EVENT, type LibrarySearchPrefill } from '@/common/lib/librarySearchTrigger';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManagedPicker } from '@/common/components/LazyManaged';
import { PICKER_VEIL_CLASS } from '@/common/lib/pickerChrome';

const ManagedLibrarySearch = lazyWithRetry(() => import('./ManagedLibrarySearch'));

interface SearchRequest {
  id: number;
  prefill: LibrarySearchPrefill | null;
}

/** Event ownership stays eager so the first shortcut cannot race the dynamic
 *  import; the search UI — and the search-memory module — load only when
 *  requested (the prefill is applied by the lazy dialog, keeping this
 *  wrapper out of the entry chunk's budget). */
export function LibrarySearch() {
  const { modal, cascadePrompt, ctxMenu, renaming } = useUiShell();
  const settingsBlocking = useSettingsBlocking();
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const nextRequestId = useRef(0);
  const restoreRef = useRef<HTMLElement | null>(null);
  const blocked = Boolean(settingsBlocking || modal || cascadePrompt || ctxMenu || renaming);

  useEffect(() => {
    const onOpen = (event: Event) => {
      // Same topmost check as Quick Open: every blocking surface carries the
      // shared veil / marker class, so the shortcut cannot escape one. The
      // popup opens even with an empty library — it explains the zero state
      // itself instead of silently swallowing the shortcut.
      if (blocked || document.querySelector('.modal-veil, .quick-open-veil, .quick-open-blocking')) return;
      restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      nextRequestId.current += 1;
      setRequest({
        id: nextRequestId.current,
        prefill: (event as CustomEvent<LibrarySearchPrefill | null>).detail ?? null,
      });
    };
    window.addEventListener(OPEN_LIBRARY_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LIBRARY_SEARCH_EVENT, onOpen);
  }, [blocked]);

  if (!request) return null;
  const close = () => {
    setRequest(null);
    requestAnimationFrame(() => restoreRef.current?.focus());
  };
  const loadingClass = `${PICKER_VEIL_CLASS} quick-open-blocking text-sm text-muted-foreground`;
  return (
    <LazyManagedPicker
      as={ManagedLibrarySearch}
      requestId={request.id}
      label="Search"
      loadingClass={loadingClass}
      componentProps={{ prefill: request.prefill, onClose: close }}
    />
  );
}
