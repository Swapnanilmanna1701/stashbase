import { useRef, type RefObject } from 'react';

/** A ref that mirrors the given value on every render, for handlers bound
 * once (WebSocket callbacks, one-shot effects) that must read the current
 * value of a prop or store field at call time instead of their stale render
 * closure. Read-only by convention: the mirrored source owns the value. */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
