/**
 * Public surface of the Search and Retrieval feature.
 *
 * Three always-mounted gates: the two popups render nothing until their
 * trigger fires and then pull in their own `Managed…` body (the real
 * lazy boundary lives inside each gate, so these three stay eager and
 * tiny), and the find bar is in-document find.
 */
export { FindBar } from '@/features/search/components/FindBar';
export { LibrarySearch } from '@/features/search/components/LibrarySearch';
export { QuickOpen } from '@/features/search/components/QuickOpen';
