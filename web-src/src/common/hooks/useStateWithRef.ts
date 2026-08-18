import { useCallback, useRef, useState, type RefObject } from 'react';

/** `useState` plus an always-current ref, written together by one setter.
 *
 * For state that event handlers bound once (WebSocket callbacks, timers)
 * must read at their own call time: the returned ref is updated
 * synchronously inside the setter, so a handler holding a stale render
 * closure still sees the latest value through `ref.current`. Replaces the
 * hand-rolled state+ref twins where every setter had to remember both
 * writes and one missed sync became a silent stale read.
 *
 * Functional updates resolve against the ref, so back-to-back calls in one
 * batch chain exactly like `useState` updater functions. The ref must never
 * be written directly — the setter is the only writer.
 */
export function useStateWithRef<T>(
  initial: T | (() => T),
): [T, (next: T | ((current: T) => T)) => void, RefObject<T>] {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const set = useCallback((next: T | ((current: T) => T)) => {
    const resolved = typeof next === 'function'
      ? (next as (current: T) => T)(ref.current)
      : next;
    ref.current = resolved;
    setValue(resolved);
  }, []);
  return [value, set, ref];
}
