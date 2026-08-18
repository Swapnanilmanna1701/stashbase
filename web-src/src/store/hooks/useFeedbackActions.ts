import { useCallback, useRef } from 'react';
import { api } from '@/common/api/api';
import {
  feedbackToasts,
  type ToastOptions,
} from '@/common/lib/feedbackToasts';
import type { Action, CascadeDecision, CascadePrompt, ModalRequest } from '@/store/state/state';

type Dispatch = (action: Action) => void;

export type { ToastOptions };

/** Owns the single-tracked dialogs and transient toast protocol. */
export function useFeedbackActions(dispatch: Dispatch) {
  const cascadeResolveRef = useRef<((decision: CascadeDecision) => void) | null>(null);
  const modalResolveRef = useRef<((value: boolean) => void) | null>(null);

  const askCascade = useCallback((prompt: CascadePrompt): Promise<CascadeDecision> => {
    return new Promise<CascadeDecision>((resolve) => {
      if (cascadeResolveRef.current) cascadeResolveRef.current('cancel');
      cascadeResolveRef.current = resolve;
      dispatch({ type: 'CASCADE_PROMPT', prompt });
    });
  }, [dispatch]);

  const resolveCascadePrompt = useCallback((decision: CascadeDecision) => {
    const resolve = cascadeResolveRef.current;
    cascadeResolveRef.current = null;
    dispatch({ type: 'CASCADE_PROMPT', prompt: null });
    resolve?.(decision);
  }, [dispatch]);

  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      modalResolveRef.current?.(false);
      modalResolveRef.current = () => resolve();
      dispatch({ type: 'MODAL_OPEN', request: { type: 'alert', message } });
    });
  }, [dispatch]);

  const askConfirm = useCallback((
    message: string,
    opts?: Pick<ModalRequest, 'title' | 'confirmLabel' | 'destructive'>,
  ): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      modalResolveRef.current?.(false);
      modalResolveRef.current = resolve;
      dispatch({ type: 'MODAL_OPEN', request: { type: 'confirm', message, ...opts } });
    });
  }, [dispatch]);

  const resolveModal = useCallback((value: boolean) => {
    const resolve = modalResolveRef.current;
    modalResolveRef.current = null;
    dispatch({ type: 'MODAL_CLOSE' });
    resolve?.(value);
  }, [dispatch]);

  const toast = useCallback((message: string, opts?: ToastOptions): string => {
    return feedbackToasts.show(message, opts);
  }, []);

  const askCascadeForRename = useCallback(async (
    kind: 'file' | 'folder',
    oldPath: string,
    newPath: string,
  ): Promise<boolean | null> => {
    try {
      const preview = await api.renamePreview(kind, oldPath, newPath);
      if (preview.files === 0) return true;
      const decision = await askCascade({
        kind,
        oldPath,
        newPath,
        files: preview.files,
        links: preview.links,
      });
      if (decision === 'cancel') return null;
      return decision === 'update';
    } catch (err) {
      console.warn(`[${kind} rename] preview failed:`, err);
      return true;
    }
  }, [askCascade]);

  return {
    askCascadeForRename,
    askConfirm,
    resolveCascadePrompt,
    resolveModal,
    showAlert,
    toast,
  };
}
