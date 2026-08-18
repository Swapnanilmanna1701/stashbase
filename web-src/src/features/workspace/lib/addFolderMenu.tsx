import { api, errorMessage } from '@/common/api/api';
import { electronBridge } from '@/common/lib/electronBridge';
import { FolderIcon, NewFolderIcon } from '@/common/components/icons';
import type { useAppActions } from '@/store/contexts/AppContext';
import type { MenuItem } from '@/common/components/Menu';

/** The two add-folder flows shared by the switcher (and the zero-folder
 *  hero button, which keeps its own copy of the first). "Open Folder…"
 *  picks any folder on disk and opens it in place (nothing is copied; it
 *  is indexed where it lives). "New Folder…" opens the same native picker
 *  at the default StashBase home so the OS panel's New Folder button
 *  lands in the expected place. Browser mode (no Electron bridge) has no
 *  portable absolute-path picker, so the list is empty. */
export function addFolderMenuItems(
  actions: ReturnType<typeof useAppActions>['actions'],
  bridge: ReturnType<typeof electronBridge>,
): MenuItem[] {
  if (typeof bridge?.openFolderDialog !== 'function') return [];

  async function openExistingFolder() {
    try {
      const picked = await bridge!.openFolderDialog!({
        title: 'Select folder',
        buttonLabel: 'Select folder',
        allowCreateDirectory: true,
      });
      if (picked) await actions.openFolder(picked);
    } catch (err) {
      actions.toast('Could not open the folder: ' + errorMessage(err), { level: 'error' });
    }
  }

  async function newFolderFromHome() {
    try {
      const { path } = await api.getFolderHome();
      const picked = await bridge!.openFolderDialog!({
        title: 'Create or select folder',
        buttonLabel: 'Select folder',
        defaultPath: path,
        allowCreateDirectory: true,
      });
      if (picked) await actions.openFolder(picked);
    } catch (err) {
      actions.toast('New folder failed: ' + errorMessage(err), { level: 'error' });
    }
  }

  return [
    {
      label: 'Open Folder…',
      icon: <FolderIcon />,
      detail: 'Any folder on your disk, indexed in place',
      onSelect: () => { void openExistingFolder(); },
    },
    {
      label: 'New Folder…',
      icon: <NewFolderIcon />,
      detail: 'Created under the StashBase folder home',
      onSelect: () => { void newFolderFromHome(); },
    },
  ];
}

/**
 * Titlebar folder switcher — the ONE home for moving between library
 * folders (Trae/VS Code workspace-switcher register, placed right of the
 * search control). The trigger carries the window's folder identity
 * ("design-docs ⌄", or "Library ⌄" with no folder open), so the identity
 * survives a sidebar collapse; the menu lists the add-folder actions on
 * top and the whole membership below (favorites first, current checked,
 * needs-attention members carrying the quiet warning dot).
 */
