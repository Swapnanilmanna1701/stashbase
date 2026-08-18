/**
 * Public surface of the Preparation feature.
 *
 * All three surfaces are conditional — a callout renders only while its
 * condition holds, and the modal only once opened — so each stays behind
 * the feature's own lazy boundary. Callers mount them inside a Suspense
 * (and, where a failure must not take the shell down, a LazyLoadBoundary).
 */
import { lazyWithRetry } from '@/common/components/ErrorBoundary';

export const EmbeddingSetupCallout = lazyWithRetry(() =>
  import('@/features/preparation/components/EmbeddingSetupCallout'));

export const UnsupportedFilesCallout = lazyWithRetry(() =>
  import('@/features/preparation/components/UnsupportedFilesCallout'));

export const UnsupportedFilesModal = lazyWithRetry(() =>
  import('@/features/preparation/components/UnsupportedFilesModal'));
