import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/** Fold state for the sidebar's Document Outline section, with its
 *  per-document default.
 *
 *  Switching to another document re-applies that default: expanded as
 *  soon as the outline actually HAS headings (they load async, so the
 *  switch only marks the intent). A manual fold wins within the current
 *  document — the same "transition resets the default" rule as the
 *  Library's folder-presence effect.
 *
 *  `documentKey` is the caller's file identity (`null` when nothing with
 *  an outline is open), so an in-place navigation refreshes the outline
 *  for the replacement file. The pending flag is armed during render
 *  rather than in an effect: the key changes in the same render that
 *  shows the new document, and arming a render later would let one
 *  paint of the new document run under the old document's fold state. */
export function useOutlineDefaultExpansion(
  documentKey: string | null,
  hasHeadings: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [expanded, setExpanded] = useState(true);
  const documentKeyRef = useRef(documentKey);
  const defaultPending = useRef(false);

  if (documentKeyRef.current !== documentKey) {
    documentKeyRef.current = documentKey;
    defaultPending.current = documentKey != null;
  }

  useEffect(() => {
    if (defaultPending.current && hasHeadings) {
      defaultPending.current = false;
      setExpanded(true);
    }
  }, [documentKey, hasHeadings]);

  return [expanded, setExpanded];
}
