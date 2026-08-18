export interface FolderMutationQueue {
  run<T>(operation: () => Promise<T> | T): Promise<T>;
}

/** Serializes server mutations of one renderer window's folder context.
 * Reads and background work stay concurrent; only open/close transitions
 * enter this queue. */
export function createFolderMutationQueue(): FolderMutationQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(operation: () => Promise<T> | T): Promise<T> {
      const result = tail.then(operation, operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
