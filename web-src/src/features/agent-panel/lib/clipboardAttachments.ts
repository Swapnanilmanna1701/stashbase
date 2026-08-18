const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function generatedClipboardName(type: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `clipboard-${stamp}.${IMAGE_EXTENSIONS[type] ?? 'png'}`;
}

/**
 * Select image representations from a browser paste payload. Clipboard
 * images generally arrive without a useful filename, so copy them into a
 * File with a stable, human-readable name before sending them through the
 * normal transient-attachment upload path. Text is intentionally untouched:
 * CodeMirror's native paste continues after this function returns.
 */
export function clipboardImageFiles(clipboard: DataTransfer, now = new Date()): File[] {
  const files = Array.from(clipboard.files);
  const candidates = files.length
    ? files
    : Array.from(clipboard.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
  return candidates
    .filter((file) => file.type.startsWith('image/'))
    .map((file) => {
      const name = file.name || generatedClipboardName(file.type, now);
      return new File([file], name, { type: file.type, lastModified: file.lastModified });
    });
}

/**
 * Handle the attachment half of a composer paste without cancelling the DOM
 * event. Returning false is part of the contract: it lets CodeMirror insert
 * any simultaneous plain text, so mixed clipboard payloads never duplicate
 * or discard text.
 */
export function handleComposerPaste(
  clipboard: DataTransfer | null,
  disabled: boolean,
  onPasteImages: (files: File[]) => void,
  now = new Date(),
): false {
  if (!disabled && clipboard) {
    const files = clipboardImageFiles(clipboard, now);
    if (files.length) onPasteImages(files);
  }
  return false;
}
