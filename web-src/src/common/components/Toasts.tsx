import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManaged } from '@/common/components/LazyManaged';

const ManagedToasts = lazyWithRetry(() => import('@/common/components/ManagedToasts'));

/** Start loading the managed viewport with the shell without adding its Base
 * UI implementation to the initial synchronous chunk. */
export function Toasts() {
  return <LazyManaged as={ManagedToasts} fallback={null} componentProps={{}} />;
}
