/**
 * Public surface of the Account feature.
 *
 * The sidebar row is the feature's only cross-layer surface, and it is an
 * interaction-boundary load (hosted-account state, avatar, sign-in flow),
 * so the feature owns the lazy boundary rather than exporting the module
 * eagerly — a bare `export {}` here would pull the row into the initial
 * chunk the moment `app/` imports this barrel.
 */
import { lazyWithRetry } from '@/common/components/ErrorBoundary';

export const SidebarAccountRow = lazyWithRetry(() =>
  import('@/features/account/components/SidebarAccountRow').then((mod) => ({ default: mod.SidebarAccountRow })));
