import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/common/components/ui/dialog';
import type { ModalShellProps } from '@/common/components/ModalShell';

export default function ManagedModalShell({
  title,
  description,
  onCancel,
  closeOnBackdrop = true,
  initialFocus,
  wide,
  narrow,
  top,
  children,
  isTopmost,
}: ModalShellProps & {
  isTopmost: boolean;
}) {
  const widthClass = wide
    ? 'w-[min(480px,92vw)]'
    : narrow
      ? 'w-[min(376px,90vw)]'
      : 'w-[min(420px,90vw)]';
  return (
    <Dialog
      open
      disablePointerDismissal={!closeOnBackdrop}
      onOpenChange={(open) => {
        if (!open && isTopmost) onCancel();
      }}
    >
      <DialogContent
        className={`${widthClass} !max-w-[92vw] !gap-0 border border-border bg-background px-6 pt-5.5 pb-5 shadow-elevation${top ? ' !z-[10001]' : ''}`}
        overlayClassName={top ? 'top !z-[10000]' : undefined}
        initialFocus={initialFocus}
        showCloseButton={false}
      >
        <DialogTitle className="text-base font-medium leading-snug">{title}</DialogTitle>
        {description !== undefined && (
          <DialogDescription className="mt-2 mb-3.5 text-base leading-normal [&_code]:font-mono [&_code]:text-sm [&_code]:text-accent">{description}</DialogDescription>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
