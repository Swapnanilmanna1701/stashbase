import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DocumentHeading } from '@/common/lib/documentOutline';

type DocumentOutlineModel = {
  headings: DocumentHeading[];
  activeId: string | null;
  onSelect: (heading: DocumentHeading) => void;
};

const emptyOutline: DocumentOutlineModel = {
  headings: [],
  activeId: null,
  onSelect: () => {},
};

type DocumentOutlineContextValue = {
  outline: DocumentOutlineModel;
  publishOutline: (outline: DocumentOutlineModel) => void;
  clearOutline: () => void;
};

const DocumentOutlineContext = createContext<DocumentOutlineContextValue | null>(null);

/** Shares the retained Markdown document's heading navigation with the
 * sidebar. The outline is transient UI state: Markdown remains the source of
 * truth and the editor remains the only document surface. */
export function DocumentOutlineProvider({ children }: { children: ReactNode }) {
  const [outline, setOutline] = useState<DocumentOutlineModel>(emptyOutline);
  const publishOutline = useCallback((next: DocumentOutlineModel) => setOutline(next), []);
  const clearOutline = useCallback(() => setOutline(emptyOutline), []);
  const value = useMemo(() => ({ outline, publishOutline, clearOutline }), [outline, publishOutline, clearOutline]);
  return <DocumentOutlineContext.Provider value={value}>{children}</DocumentOutlineContext.Provider>;
}

export function useDocumentOutline() {
  const value = useContext(DocumentOutlineContext);
  if (!value) throw new Error('useDocumentOutline must be used within DocumentOutlineProvider');
  return value;
}
