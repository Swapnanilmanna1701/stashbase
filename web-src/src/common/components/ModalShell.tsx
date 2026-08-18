import { type ReactNode, type RefObject } from 'react';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManagedModal } from '@/common/components/LazyManaged';

export interface ModalShellProps {
  title: ReactNode;
  description?: ReactNode;
  onCancel: () => void;
  closeOnBackdrop?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  wide?: boolean;
  /** Tighter column for short, choice-style dialogs (e.g. the indexing
   *  setup gate) where the default width lets prose run long. */
  narrow?: boolean;
  top?: boolean;
  children?: ReactNode;
}

const ManagedModalShell = lazyWithRetry(() => import('@/common/components/ManagedModalShell'));

/**
 * Interaction-boundary loader for the managed dialog. The fallback is status
 * only: it never recreates an unmanaged modal while Base UI is loading.
 */
export function ModalShell(props: ModalShellProps) {
  return (
    <LazyManagedModal
      as={ManagedModalShell}
      open
      label="Opening dialog…"
      onCancel={props.onCancel}
      closeOnBackdrop={props.closeOnBackdrop ?? true}
      componentProps={props}
    />
  );
}
