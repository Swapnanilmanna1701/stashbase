/** Return an uploaded workspace path relative to the note that owns it. */
export function relativeAssetPath(noteName: string, uploadedPath: string): string {
  const noteDir = noteName.split('/').slice(0, -1).join('/');
  const prefix = noteDir ? `${noteDir}/` : '';
  return uploadedPath.startsWith(prefix) ? uploadedPath.slice(prefix.length) : uploadedPath;
}

/** Keep image Markdown portable; DOM rendering resolves this path against the
 * active note's asset URL only after Milkdown has parsed it. */
export function portableImageMarkdownPath(relativePath: string): string {
  return relativePath.split('/').map(encodeURIComponent).join('/');
}
