import { Suspense, type ComponentType, type ReactNode } from 'react';
import { LazyLoadBoundary } from '@/common/components/ErrorBoundary';
import { useOverlayLayer } from '@/common/components/OverlayStack';
import { ModalLoadingStatus } from '@/common/components/ui/status';

/**
 * Every `Managed*` container is a `lazyWithRetry`-loaded component wrapped
 * in `<Suspense>` with a site-specific fallback. This is that shared
 * skeleton — the `lazyWithRetry(...)` call itself stays at module scope in
 * each container (it must run once per module, not per render), so this
 * takes the already-created lazy component as `as`, not a loader.
 */
export function LazyManaged<P extends object>({
  as: Component,
  fallback,
  componentProps,
  componentKey,
}: {
  as: ComponentType<P>;
  fallback: ReactNode;
  componentProps: P;
  /** Forces a full remount of the managed component when it changes —
   *  the picker sites use this to give each open request a clean instance. */
  componentKey?: string;
}) {
  return (
    <Suspense fallback={fallback}>
      <Component key={componentKey} {...componentProps} />
    </Suspense>
  );
}

/**
 * The "blocking modal" fallback recipe shared by ModalShell,
 * AlertConfirmModal, ClipboardImportModal, and SettingsPortal: register an
 * overlay-stack layer while open, and show a native `<dialog>` loading
 * placeholder that owns Esc / backdrop dismissal until the real dialog
 * takes over.
 */
export function LazyManagedModal<P extends { isTopmost: boolean }>({
  as: Component,
  open,
  label,
  onCancel,
  closeOnBackdrop,
  componentProps,
}: {
  as: ComponentType<P>;
  open: boolean;
  label: string;
  onCancel: () => void;
  closeOnBackdrop?: boolean;
  componentProps: Omit<P, 'isTopmost'>;
}) {
  const layer = useOverlayLayer(open);
  return (
    <LazyManaged
      as={Component}
      fallback={(
        <ModalLoadingStatus
          label={label}
          isTopmost={layer.isTopmost}
          onCancel={onCancel}
          closeOnBackdrop={closeOnBackdrop}
        />
      )}
      componentProps={{ ...componentProps, isTopmost: layer.isTopmost } as P}
    />
  );
}

/**
 * The "event-triggered picker" fallback recipe shared by LibrarySearch and
 * QuickOpen: an error boundary keyed to the request id (so a retry after a
 * failed dynamic import gets a clean remount), plus a plain status line
 * while the picker's own chunk loads.
 */
export function LazyManagedPicker<P extends object>({
  as: Component,
  requestId,
  label,
  loadingClass,
  componentProps,
}: {
  as: ComponentType<P>;
  requestId: number;
  label: string;
  loadingClass: string;
  componentProps: P;
}) {
  return (
    <LazyLoadBoundary className={loadingClass} label={label} resetKey={String(requestId)}>
      <LazyManaged
        as={Component}
        fallback={<div className={loadingClass}>Opening {label}…</div>}
        componentProps={componentProps}
        componentKey={String(requestId)}
      />
    </LazyLoadBoundary>
  );
}
