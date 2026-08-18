/** Resolve portable Markdown image paths only against the current note's
 * workspace asset base. Remote and malformed URLs are intentionally inert. */
export function resolveLocalImageUrl(raw: string, assetBase: string, origin: string): string {
  const source = raw.trim();
  // Markdown document images are portable relative workspace paths. Reject
  // absolute, protocol-relative, and backslash paths before URL resolution:
  // the URL parser would otherwise turn `//host/image` into a remote request.
  if (!source || /^[a-z][a-z\d+.-]*:/i.test(source) || /^[\\/#]/.test(source)) return '';
  try {
    const resolved = new URL(source, new URL(assetBase, origin));
    return resolved.origin === origin ? resolved.href : '';
  } catch {
    return '';
  }
}
