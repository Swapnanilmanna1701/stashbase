import { useAppActions, useUiShell, useWorkspace } from '@/store/contexts/AppContext';
import { getPreparationProblem } from '@/store/lib/fileReadiness';
import { Menu, type MenuItem } from '@/common/components/Menu';

/** Right-click menu for file and folder rows. Loaded only after state owns a
 *  context-menu request; positioning and dismissal stay in the shared Menu. */
export default function ContextMenu() {
  const { ctxMenu } = useUiShell();
  const { folderPath: folderPathAtOpen, preparationFailures } = useWorkspace();
  const { dispatch, actions } = useAppActions();
  if (!ctxMenu) return null;
  const { x, y, target, kind } = ctxMenu;
  const close = () => dispatch({ type: 'CTX_MENU', menu: null });
  const canReprocess = kind === 'file' && Boolean(getPreparationProblem({ preparationFailures }, target));

  const items: MenuItem[] = [
    {
      label: 'Rename…',
      returnFocus: false,
      onSelect: () => dispatch({ type: 'RENAMING', renaming: { path: target, kind } }),
    },
    { label: revealLabel(), onSelect: () => actions.revealFile(target) },
    ...(canReprocess
      ? [{
          label: 'Reprocess',
          title: 'Rebuild the searchable version of this file',
          onSelect: () => { void actions.reprocessFile(target, folderPathAtOpen || undefined); },
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
