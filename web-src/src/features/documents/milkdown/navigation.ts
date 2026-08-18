import { assetBaseUrl } from '@/common/api/api';

export type MilkdownLinkTarget =
  | { kind: 'anchor'; id: string }
  | { kind: 'note'; path: string; anchor?: string; folder?: string }
  | { kind: 'external'; href: string }
  | { kind: 'ignore' };

/** Resolve document links without allowing encoded separators to escape the
 * current workspace-relative asset namespace. `noteFolder` is set for an
 * out-of-folder tab; its relative links inherit the `__folder/` path token
 * from the base URL and resolve back to that same member folder. */
export function resolveMilkdownLink(raw: string, noteName: string, noteFolder?: string): MilkdownLinkTarget {
  if (!raw) return { kind: 'ignore' };
  if (raw.startsWith('#')) return { kind: 'anchor', id: raw.slice(1) };
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  let url: URL;
  try { url = new URL(raw, new URL(assetBaseUrl(noteName, noteFolder), origin)); } catch { return { kind: 'ignore' }; }
  const asset = url.pathname.match(/^\/asset\/(?:__window\/[^/]+\/)?(?:__folder\/([^/]+)\/)?(.+)$/);
  if (asset) {
    try {
      // The folder token is double-encoded in the URL (one decode below,
      // one by the author) so its slashes never read as path separators.
      const folder = asset[1] ? decodeURIComponent(decodeURIComponent(asset[1])) : undefined;
      const decoded = asset[2].split('/').map(decodeURIComponent);
      if (decoded.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))) return { kind: 'ignore' };
      const path = decoded.join('/');
      if (/\.(md|markdown|html|htm)$/i.test(path)) {
        return { kind: 'note', path, anchor: url.hash.slice(1) || undefined, ...(folder ? { folder } : {}) };
      }
      return { kind: 'ignore' };
    } catch { return { kind: 'ignore' }; }
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? { kind: 'external', href: url.href } : { kind: 'ignore' };
}
