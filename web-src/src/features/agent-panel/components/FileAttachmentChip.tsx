import type { ReactNode } from 'react';

import { FileTypeIcon } from '@/common/components/FileTypeIcon';
import { ImageLightbox } from '@/common/components/ImageLightbox';
import { fileGlyphFormat } from '@/common/lib/fileGlyphFormat';
import { attachChipClass, attachIconTileClass, attachImageChipClass, attachImagePreviewClass, attachNameClass, attachTextClass, attachTypeClass } from '@/features/agent-panel/lib/panelStyles';
import type { Attachment } from '@/features/agent-panel/lib/types';

/** The shared file attachment card — a muted type glyph, the filename, and a
 *  type label under it (GPT-style two-line card kept in the panel's neutral
 *  palette). Used both as a removable composer chip and as static transcript
 *  content: `trailing` carries the composer's remove button, and `meta`
 *  appends a detail (e.g. image dimensions) after the type label. */
export function FileAttachmentChip({ name, path, meta, trailing }: {
  name: string;
  path: string;
  meta?: string;
  trailing?: ReactNode;
}) {
  const { format, label } = fileGlyphFormat(name);
  return (
    <span className={attachChipClass} title={path}>
      <span className={attachIconTileClass}><FileTypeIcon format={format} /></span>
      <span className={attachTextClass}>
        <span className={attachNameClass}>{name}</span>
        <span className={attachTypeClass}>{meta ? `${label} · ${meta}` : label}</span>
      </span>
      {trailing}
    </span>
  );
}

/** The shared 64px image thumbnail chip — a press opens the full-size
 *  preview (the caller owns which attachment is being previewed and
 *  renders one `AttachmentLightbox`). Used as static transcript content;
 *  `trailing` leaves room for the composer's floating remove button. */
export function ImageAttachmentChip({ name, previewUrl, onPreview, trailing }: {
  name: string;
  previewUrl: string;
  onPreview: () => void;
  trailing?: ReactNode;
}) {
  return (
    <span className={attachImageChipClass}>
      <button
        type="button"
        className={attachImagePreviewClass}
        aria-label={`Preview ${name}`}
        onClick={onPreview}
      >
        <img src={previewUrl} alt="" />
      </button>
      {trailing}
    </span>
  );
}

/** The lightbox an ImageAttachmentChip press opens. Renders nothing until
 *  an attachment with a preview URL is selected, so callers can keep a
 *  single `useState<Attachment | null>` and mount this unconditionally. */
export function AttachmentLightbox({ attachment, onClose }: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  if (!attachment?.previewUrl) return null;
  return <ImageLightbox src={attachment.previewUrl} alt={attachment.name} onClose={onClose} />;
}
