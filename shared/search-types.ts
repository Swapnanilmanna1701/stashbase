/** File-type categories the search surfaces can filter by. Shared
 *  vocabulary between the renderer (chips) and the server (extension
 *  mapping); the category → extension mapping itself stays in
 *  `server/format.ts` next to the other extension knowledge. */
export const SEARCH_TYPE_CATEGORIES = ['notes', 'data', 'pdf', 'image', 'docx', 'spreadsheets', 'audio'] as const;

export type SearchTypeCategory = (typeof SEARCH_TYPE_CATEGORIES)[number];

export const SEARCH_MODES = ['semantic', 'keyword'] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];

export function isSearchTypeCategory(value: unknown): value is SearchTypeCategory {
  return typeof value === 'string' && (SEARCH_TYPE_CATEGORIES as readonly string[]).includes(value);
}

export const SEARCH_TYPES_VALIDATION_ERROR =
  `unknown search type; types must be an array containing only: ${SEARCH_TYPE_CATEGORIES.join(', ')}`;

export const SEARCH_MODE_VALIDATION_ERROR =
  `unknown search mode; mode must be one of: ${SEARCH_MODES.join(', ')}`;

/** Applies the semantic default only when the transport omits `mode`.
 *  Malformed and unknown values stay distinguishable from omission so an
 *  adapter never turns a typo into an embedding-dependent search. */
export function parseSearchMode(raw: unknown): SearchMode | null {
  if (raw == null) return 'semantic';
  const value = typeof raw === 'string' ? raw.trim() : raw;
  return typeof value === 'string' && (SEARCH_MODES as readonly string[]).includes(value)
    ? (value as SearchMode)
    : null;
}

/** Normalizes an optional transport value into the shared search vocabulary.
 *  Absent → empty list (no filter); malformed input or any unknown entry →
 *  null so each transport can return its native validation error envelope. */
export function parseSearchTypes(raw: unknown): SearchTypeCategory[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out: SearchTypeCategory[] = [];
  for (const entry of raw) {
    const value = typeof entry === 'string' ? entry.trim() : entry;
    if (!isSearchTypeCategory(value)) return null;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
