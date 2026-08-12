import type { ReactNode } from 'react';

import { FileTypeIcon } from '../FileTree';
import { attachmentFileType } from './attachments';
import { attachChipClass, attachIconTileClass, attachNameClass, attachTextClass, attachTypeClass } from './panelStyles';

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
  const { format, label } = attachmentFileType(name);
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
