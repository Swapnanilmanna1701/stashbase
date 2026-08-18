import { useRef } from 'react';
import type { ModalRequest } from '@/store/state/state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/common/components/ui/alert-dialog';

export default function ManagedAlertConfirmModal({
  request,
  isTopmost,
  onResolve,
}: {
  request: ModalRequest;
  isTopmost: boolean;
  onResolve: (value: boolean) => void;
}) {
  const isConfirm = request.type === 'confirm';
  const requestRef = useRef(request);
  const resultRef = useRef(false);
  if (requestRef.current !== request) {
    requestRef.current = request;
    resultRef.current = false;
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && isTopmost) onResolve(resultRef.current);
      }}
    >
      <AlertDialogContent
        className="w-[min(420px,90vw)] !z-[10001] !max-w-[90vw] !gap-0 border border-border bg-background px-6 pt-5.5 pb-5 shadow-elevation"
        overlayClassName="top !z-[10000]"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isConfirm ? request.title ?? 'Confirm action' : 'Notice'}
          </AlertDialogTitle>
          <AlertDialogDescription className="my-0 text-base leading-normal">
            {request.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-3.5 flex-row justify-end gap-2">
          {isConfirm && (
            <AlertDialogCancel onClick={() => {
              resultRef.current = false;
            }}>
              Cancel
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            autoFocus
            variant={request.destructive ? 'destructive' : 'default'}
            onClick={() => {
              resultRef.current = true;
            }}
          >
            {isConfirm ? request.confirmLabel ?? 'Confirm' : 'OK'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
