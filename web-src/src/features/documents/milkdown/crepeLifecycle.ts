import { EditorStatus } from '@milkdown/kit/core';

export interface StatusAwareCrepe {
  editor: { status: EditorStatus };
  destroy: () => Promise<unknown>;
}

export interface CreatableStatusAwareCrepe extends StatusAwareCrepe {
  create: () => Promise<unknown>;
}

export function destroyCrepeIfCreated(editor: StatusAwareCrepe): boolean {
  if (editor.editor.status !== EditorStatus.Created) return false;
  void editor.destroy();
  return true;
}

/**
 * Own one asynchronous Crepe creation attempt. A rejected Milkdown editor is
 * left in `OnCreate`, where calling destroy would start an endless retry loop;
 * a successfully created editor is destroyed exactly once on disposal.
 */
export function startCrepeCreation<T extends CreatableStatusAwareCrepe>(
  editor: T,
  callbacks: {
    ready: (editor: T) => void;
    failed: (error: unknown) => void;
  },
): () => void {
  let disposed = false;
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = destroyCrepeIfCreated(editor);
  };

  void editor.create().then(() => {
    if (disposed) {
      destroy();
      return;
    }
    callbacks.ready(editor);
  }).catch((error: unknown) => {
    if (!disposed) callbacks.failed(error);
  });

  return () => {
    disposed = true;
    destroy();
  };
}

export interface IncomingMarkdownSync {
  observedSource: string;
  frontmatter: string;
  replacementBody: string | null;
}

/** Plan a clean-source refresh without letting retained React props overwrite
 * a dirty live buffer. This is also used immediately after asynchronous
 * creation so an external edit that arrived during `create()` is not lost. */
export function planIncomingMarkdownSync({
  currentBody,
  dirty,
  incomingBody,
  incomingFrontmatter,
  incomingSource,
  observedSource,
}: {
  currentBody: string;
  dirty: boolean;
  incomingBody: string;
  incomingFrontmatter: string;
  incomingSource: string;
  observedSource: string;
}): IncomingMarkdownSync | null {
  if (dirty) return null;
  return {
    observedSource: incomingSource,
    frontmatter: incomingFrontmatter,
    replacementBody: observedSource === incomingSource || currentBody === incomingBody
      ? null
      : incomingBody,
  };
}
