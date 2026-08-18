import { useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useLatestRef } from '@/common/hooks/useLatestRef';
import { makePdfFindController, type PdfFindMatch } from '@/features/documents/lib/pdfFindController';
import type { FindController } from '@/store/contexts/AppContext';

/**
 * FindBar integration — registers a Cmd+F-driven controller so the user can
 * search PDFs the same way they search MD / HTML / code. The match scan and
 * navigation state live in `pdfFindController`; this hook only owns the
 * registration's lifetime, which is exactly the document's.
 *
 * `onActiveMatch` / `onClose` are read through a ref rather than listed as
 * dependencies: they are inline closures over the viewer's scroll owner and
 * highlight state, so depending on them would tear down and re-register the
 * controller on every render, dropping the user's in-flight search.
 */
export function usePdfFindRegistration({
  doc,
  numPages,
  registerFindController,
  onActiveMatch,
  onClose,
}: {
  doc: PDFDocumentProxy | null;
  numPages: number;
  registerFindController: (controller: FindController | null) => void;
  onActiveMatch: (match: PdfFindMatch) => void;
  onClose: () => void;
}): void {
  const handlersRef = useLatestRef({ onActiveMatch, onClose });

  useEffect(() => {
    if (!doc) return;
    const { controller, dispose } = makePdfFindController({
      doc,
      numPages,
      onActiveMatch: (match) => handlersRef.current.onActiveMatch(match),
      onClose: () => handlersRef.current.onClose(),
    });
    registerFindController(controller);
    return () => {
      dispose();
      registerFindController(null);
    };
  }, [doc, numPages, registerFindController]);
}
