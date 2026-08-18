import { useEffect, useRef, useState } from 'react';
import { useSettingsBlocking } from '@/common/hooks/useSettingsBlocking';
import { useUiShell, useWorkspace } from '@/store/contexts/AppContext';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManagedPicker } from '@/common/components/LazyManaged';
import { PICKER_VEIL_CLASS } from '@/common/lib/pickerChrome';

const ManagedQuickOpen = lazyWithRetry(() => import('./ManagedQuickOpen'));

interface QuickOpenRequest {
  commandsOnly: boolean;
  id: number;
}

/** Event ownership stays eager so the first shortcut cannot race the dynamic
 *  import. Ranking, command definitions, and picker rendering load only when
 *  Quick Open or the Command Palette is requested. */
export function QuickOpen() {
  const { modal, cascadePrompt, ctxMenu, renaming } = useUiShell();
  const { folder } = useWorkspace();
  const settingsBlocking = useSettingsBlocking();
  const [request, setRequest] = useState<QuickOpenRequest | null>(null);
  const nextRequestId = useRef(0);
  const restoreRef = useRef<HTMLElement | null>(null);
  const blocked = Boolean(settingsBlocking || modal || cascadePrompt || ctxMenu || renaming);

  useEffect(() => {
    const onOpen = (event: Event) => {
      // Some blocking UI (notably Agent permission cards) owns local state
      // outside this reducer. Every blocking surface uses the shared modal
      // veil, so this final topmost check keeps the shortcut from escaping it.
      const commandsOnly = (event as CustomEvent<{ mode?: string }>).detail?.mode === 'commands';
      if (blocked || document.querySelector('.modal-veil, .quick-open-blocking') || (!commandsOnly && !folder)) return;
      restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      nextRequestId.current += 1;
      setRequest({ commandsOnly, id: nextRequestId.current });
    };
    window.addEventListener('stashbase-open-quick-open', onOpen);
    return () => window.removeEventListener('stashbase-open-quick-open', onOpen);
  }, [blocked, folder]);

  if (!request) return null;
  const close = () => {
    setRequest(null);
    requestAnimationFrame(() => restoreRef.current?.focus());
  };
  const loadingClass = `${PICKER_VEIL_CLASS} quick-open-blocking text-sm text-muted-foreground`;
  return (
    <LazyManagedPicker
      as={ManagedQuickOpen}
      requestId={request.id}
      label="Quick Open"
      loadingClass={loadingClass}
      componentProps={{ commandsOnly: request.commandsOnly, onClose: close }}
    />
  );
}
