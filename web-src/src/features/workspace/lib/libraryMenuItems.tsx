import { FolderIcon } from '@/common/components/icons';
import { basename, shortenFolderPath } from '@/common/lib/paths';
import { addFolderMenuItems } from '@/features/workspace/lib/addFolderMenu';
import type { electronBridge } from '@/common/lib/electronBridge';
import type { useAppActions } from '@/store/contexts/AppContext';
import type { MenuItem } from '@/common/components/Menu';
import type { LibraryListEntry } from '@/features/workspace/lib/libraryListPlan';

/**
 * The library menu's one content home, shared by its two triggers: the
 * titlebar folder switcher and the sidebar's no-folder Choose Folder
 * invitation. Add-folder flows ride `pinned` so they stay put while a
 * long membership scrolls; the membership itself lists favorites first.
 * Row selection semantics (what "current" means, how a pick opens) stay
 * with the caller — the two triggers differ exactly there.
 */
export function libraryMenuItems(opts: {
  actions: ReturnType<typeof useAppActions>['actions'];
  bridge: ReturnType<typeof electronBridge>;
  entries: LibraryListEntry[];
  homeDir: string;
  attention: (path: string) => boolean;
  isCurrent: (path: string) => boolean;
  onPick: (path: string) => void;
}): { pinned: MenuItem[]; list: MenuItem[] } {
  const add = addFolderMenuItems(opts.actions, opts.bridge);
  const row = (entry: LibraryListEntry): MenuItem => ({
    label: basename(entry.path),
    icon: <FolderIcon />,
    detail: shortenFolderPath(entry.path, opts.homeDir),
    checked: opts.isCurrent(entry.path),
    attention: opts.attention(entry.path),
    onSelect: () => opts.onPick(entry.path),
  });
  const favorites = opts.entries.filter((entry) => entry.favorite);
  const rest = opts.entries.filter((entry) => !entry.favorite);
  /* "Library", not "Recent": the group is the WHOLE membership in
   * recents order — a Recent label would imply an unlisted remainder.
   * The add actions (plus the one hairline) ride `pinned`; group
   * headings stay quiet labels with no extra hairlines (the pill menus'
   * grouping rule). */
  return {
    pinned: [
      ...add,
      ...(add.length > 0 && opts.entries.length > 0 ? [{ separator: true } as MenuItem] : []),
    ],
    list: [
      ...(favorites.length > 0 ? [{ heading: 'Favorites' } as MenuItem, ...favorites.map(row)] : []),
      ...(rest.length > 0 ? [{ heading: 'Library' } as MenuItem, ...rest.map(row)] : []),
    ],
  };
}
