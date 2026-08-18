import './clipboard-offer-preview.css';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';
import { LazyManagedModal } from '@/common/components/LazyManaged';

const ManagedClipboardImport = lazyWithRetry(() => import('@/common/components/ManagedClipboardImport'));

export interface ClipboardOffer {
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
  hash: string;
  filename: string;
}

/**
 * Asks whether to import an image found on the clipboard (e.g. a
 * screenshot the user just copied, then switched back to StashBase).
 * Shown only in the Electron app — `main.cjs` pushes the offer on window
 * focus and the renderer mounts this. A thumbnail makes the source
 * obvious; Add runs the same upload path as drag-in / capture (so the
 * image gets OCR'd into a hidden note), Dismiss leaves it alone.
 *
 * Modal (not a toast) by product decision — a screenshot is a
 * deliberate "I want to keep this" moment worth a clear yes/no. The Base UI
 * dialog owns Esc and backdrop dismissal; Enter adds.
 */
export function ClipboardImportModal({
  offer,
  onAdd,
  onClose,
}: {
  offer: ClipboardOffer;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <LazyManagedModal
      as={ManagedClipboardImport}
      open
      label="Opening image import…"
      onCancel={onClose}
      closeOnBackdrop
      componentProps={{
        title: 'Add image to StashBase?',
        description: <>There's an image on your clipboard. Add it to this folder — its text gets extracted so you can search it later.</>,
        onCancel: onClose,
        onAdd,
        children: (
          <div className="clipboard-offer-preview">
            <img src={offer.dataUrl} alt="Clipboard image" />
          </div>
        ),
      }}
    />
  );
}
