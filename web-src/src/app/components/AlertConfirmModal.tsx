import { useAppActions, useUiShell } from '@/store/contexts/AppContext';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManagedModal } from '@/common/components/LazyManaged';

const ManagedAlertConfirmModal = lazyWithRetry(() => import('@/app/components/ManagedAlertConfirmModal'));

export function AlertConfirmModal() {
  const { actions } = useAppActions();
  const { modal } = useUiShell();
  if (!modal) return null;

  return (
    <LazyManagedModal
      as={ManagedAlertConfirmModal}
      open
      label="Opening confirmation…"
      onCancel={() => actions.resolveModal(false)}
      componentProps={{ request: modal, onResolve: actions.resolveModal }}
    />
  );
}
