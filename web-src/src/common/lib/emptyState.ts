/** The shared empty-slot recipe for list/picker surfaces — the one muted,
 * centered "nothing here" row (loading, no matches, empty list). Compose
 * extra layout on top (e.g. `flex-col items-center` for multi-line copy)
 * rather than restating the base. */
export const emptyStateClass = 'flex cursor-default justify-center px-2.5 py-4.5 text-sm text-muted-foreground';
