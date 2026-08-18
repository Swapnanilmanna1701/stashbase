export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  level?: ToastLevel;
  ttl?: number | null;
  action?: { label: string; onClick: () => void };
}

interface ToastRuntime {
  show(message: string, options?: ToastOptions, requestedId?: string): string;
}

interface PendingToast {
  id: string;
  message: string;
  options?: ToastOptions;
}

let runtime: ToastRuntime | null = null;
let sequence = 0;
const pending: PendingToast[] = [];

/** Lightweight initial-shell facade. Base UI is loaded by the toast viewport;
 * notifications raised before that chunk is ready are replayed on bind. */
export const feedbackToasts = {
  show(message: string, options?: ToastOptions): string {
    const id = `toast-${Date.now().toString(36)}-${++sequence}`;
    if (runtime) return runtime.show(message, options, id);
    pending.push({ id, message, options });
    return id;
  },
};

export function bindFeedbackToastRuntime(next: ToastRuntime): () => void {
  runtime = next;
  for (const toast of pending.splice(0)) {
    next.show(toast.message, toast.options, toast.id);
  }
  return () => {
    if (runtime === next) runtime = null;
  };
}
