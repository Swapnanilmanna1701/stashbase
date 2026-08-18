import type { ReactNode } from 'react';
import ManagedModalShell from '@/common/components/ManagedModalShell';
import { Button } from '@/common/components/ui/button';

/**
 * Lazy interaction-boundary body for the clipboard-import prompt: chrome
 * comes from the shared ManagedModalShell (itself the lazy dialog chunk,
 * so the Base UI stack still loads only when a prompt opens).
 */
export default function ManagedClipboardImport({
  title,
  description,
  isTopmost,
  onCancel,
  onAdd,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  isTopmost: boolean;
  onCancel: () => void;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <ManagedModalShell
      title={title}
      description={description}
      onCancel={onCancel}
      isTopmost={isTopmost}
    >
      {children}
      <div className="mt-3.5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Dismiss</Button>
        <Button type="button" autoFocus onClick={onAdd}>Add</Button>
      </div>
    </ManagedModalShell>
  );
}
