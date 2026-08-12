import { api } from '../api';
import { useApp } from '../store/AppContext';
import { getPreparationProblem } from '../store/fileReadiness';
import { Menu, type MenuItem } from './Menu';

/** Right-click menu for file and folder rows. Loaded only after state owns a
 *  context-menu request; positioning and dismissal stay in the shared Menu. */
export default function ContextMenu() {
  const { state, dispatch, actions } = useApp();
  if (!state.ctxMenu) return null;
  const { x, y, target, kind } = state.ctxMenu;
  const folderPathAtOpen = state.folderPath;
  const close = () => dispatch({ type: 'CTX_MENU', menu: null });
  const canReprocess = kind === 'file' && Boolean(getPreparationProblem(state, target));

  const items: MenuItem[] = [
    {
      label: 'Rename…',
      returnFocus: false,
      onSelect: () => dispatch({ type: 'RENAMING', renaming: { path: target, kind } }),
    },
    { label: revealLabel(), onSelect: () => void api.revealFile(target) },
    ...(canReprocess
      ? [{
          label: 'Reprocess',
          title: 'Rebuild the searchable version of this file',
          onSelect: () => {
            actions.toast('Reprocessing…', { level: 'info' });
            void api.reprocessFile(target, { folder: folderPathAtOpen || undefined })
              .then(() => actions.refreshIndexState())
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                actions.toast('Reprocess could not start. Try again.', { level: 'error' });
                console.warn('[ctxmenu] reprocess failed:', msg);
              });
          },
        } satisfies MenuItem]
      : []),
    { separator: true },
    {
      label: 'Delete',
      danger: true,
      onSelect: () => (kind === 'folder' ? void actions.deleteFolder(target) : void actions.deleteFile(target)),
    },
  ];

  return <Menu anchor={{ x, y }} items={items} onClose={close} />;
}

function revealLabel(): string {
  const platform = (navigator.platform || '').toLowerCase();
  if (platform.includes('mac')) return 'Reveal in Finder';
  if (platform.includes('win')) return 'Reveal in Explorer';
  return 'Show in File Manager';
}
