import {
  Suspense,
  type ReactNode,
  type RefObject,
} from 'react';
import { lazyWithRetry } from './ErrorBoundary';
import { useOverlayLayer } from './OverlayStack';
import { ModalLoadingStatus } from './ui/status';

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

const ManagedModalShell = lazyWithRetry(() => import('./ManagedModalShell'));

/**
 * Interaction-boundary loader for the managed dialog. The fallback is status
 * only: it never recreates an unmanaged modal while Base UI is loading.
 */
export function ModalShell(props: ModalShellProps) {
  const layer = useOverlayLayer(true);
  return (
    <Suspense
      fallback={(
        <ModalLoadingStatus
          label="Opening dialog…"
          isTopmost={layer.isTopmost}
          onCancel={props.onCancel}
          closeOnBackdrop={props.closeOnBackdrop ?? true}
        />
      )}
    >
      <ManagedModalShell {...props} isTopmost={layer.isTopmost} />
    </Suspense>
  );
}
