import './drop-veil.css';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManaged } from '@/common/components/LazyManaged';

const ManagedDropVeil = lazyWithRetry(() => import('@/common/components/ManagedDropVeil'));

/** Drag-import veil. Visibility flows from the global drag handler in
 *  the parent (`useGlobalDragDrop`) via the `hot` prop. Motion is loaded only
 *  when a drag begins, so an optional visual enhancement does not tax startup. */
export function DropVeil({ hot }: { hot: boolean }) {
  if (!hot) return null;
  return (
    <LazyManaged
      as={ManagedDropVeil}
      fallback={<div className="drop-veil hot">Release to import</div>}
      componentProps={{}}
    />
  );
}
