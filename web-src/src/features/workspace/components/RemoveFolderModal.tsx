import { ModalShell } from '@/common/components/ModalShell';
import { Button } from '@/common/components/ui/button';

/** Remove-from-library confirmation. Removal only detaches the folder
 *  from the library — it never deletes files on disk, and the copy says
 *  so. While removal is in flight both actions lock and dismissal waits,
 *  so a slow cross-window save barrier cannot be double-triggered. */
export function RemoveFolderModal({
  name,
  path,
  parentLabel,
  removing,
  onCancel,
  onConfirm,
}: {
  name: string;
  path: string;
  /** Home-shortened parent directory (`~/…`), shown so same-named
   *  folders in different places read apart. */
  parentLabel: string;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell
      title="Remove from Library?"
      description={
        <>
        StashBase will remove <strong className="font-semibold text-accent">{name}</strong> from your Library.
        It will <strong>not</strong> delete the folder or its files from your disk.
        </>
      }
      onCancel={removing ? () => { /* wait for removal */ } : onCancel}
      top
    >
      <div className="mt-2 truncate text-sm text-muted-foreground" title={path}>
        {parentLabel}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={removing}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={removing}
          onClick={onConfirm}
        >
          {removing ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </ModalShell>
  );
}
