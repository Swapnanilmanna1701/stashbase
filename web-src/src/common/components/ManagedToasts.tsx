import { useEffect } from 'react';
import { bindFeedbackToastRuntime } from '@/common/lib/feedbackToasts';
import {
  managedFeedbackToasts,
  ToastAction,
  ToastClearAll,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastRoot,
  ToastViewport,
  useFeedbackToastManager,
} from '@/common/components/ui/toast';

export default function ManagedToasts() {
  useEffect(
    () => bindFeedbackToastRuntime(managedFeedbackToasts),
    [],
  );
  return (
    <ToastProvider>
      <ToastPortal>
        <ToastList />
      </ToastPortal>
    </ToastProvider>
  );
}

function ToastList() {
  const { toasts, close } = useFeedbackToastManager();
  return (
    <ToastViewport>
      <ToastClearAll count={toasts.length} />
      {toasts.map((toast) => {
        const count = toast.data?.count ?? 1;
        const action = toast.data?.action;
        return (
          <ToastRoot key={toast.id} toast={toast}>
            <ToastContent>
              <ToastDescription>{toast.description}</ToastDescription>
              {count > 1 && (
                <span className="shrink-0 self-center rounded-full bg-muted px-1.5 text-2xs leading-4 text-muted-foreground tabular-nums">
                  ×{count}
                </span>
              )}
              {action && (
                <ToastAction
                  onClick={() => {
                    action.onClick();
                    close(toast.id);
                  }}
                >
                  {action.label}
                </ToastAction>
              )}
              <ToastClose />
            </ToastContent>
          </ToastRoot>
        );
      })}
    </ToastViewport>
  );
}
