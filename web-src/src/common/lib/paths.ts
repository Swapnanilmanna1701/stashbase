/** Display helpers for library paths. All library paths are POSIX-style
 * absolute paths, so `/` is the only separator the renderer ever sees. */

/** Last path segment, tolerating trailing slashes: `/a/b/` → `b`. */
export function basename(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments.pop() || path;
}

/** Shorten an absolute path for display: `/Users/foo/Notes` → `~/Notes`
 * when it lives under the user's home dir; unchanged otherwise
 * (e.g. `/tmp/scratch`). */
export function shortenFolderPath(abs: string, homeDir: string): string {
  if (!homeDir) return abs;
  if (abs === homeDir) return '~';
  if (abs.startsWith(homeDir + '/')) return '~/' + abs.slice(homeDir.length + 1);
  return abs;
}
