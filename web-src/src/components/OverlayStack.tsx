import {
  useId,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type OverlayStackState = readonly string[];

export function registerOverlay(
  stack: OverlayStackState,
  id: string,
): OverlayStackState {
  return stack.includes(id) ? stack : [...stack, id];
}

export function unregisterOverlay(
  stack: OverlayStackState,
  id: string,
): OverlayStackState {
  return stack.filter((candidate) => candidate !== id);
}

export function isTopOverlay(stack: OverlayStackState, id: string): boolean {
  return stack[stack.length - 1] === id;
}

let sharedStack: OverlayStackState = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function register(id: string) {
  sharedStack = registerOverlay(sharedStack, id);
  listeners.forEach((listener) => listener());
  return () => {
    sharedStack = unregisterOverlay(sharedStack, id);
    listeners.forEach((listener) => listener());
  };
}

export function OverlayStackProvider({ children }: { children: ReactNode }) {
  return children;
}

/**
 * Registers one blocking surface for as long as it is active. A newly
 * committed surface is provisionally topmost until its layout effect records
 * it; this closes the pre-paint gap without exposing registration details.
 */
export function useOverlayLayer(active: boolean) {
  const id = useId();
  const stack = useSyncExternalStore(subscribe, () => sharedStack, () => sharedStack);

  useLayoutEffect(() => {
    if (!active) return undefined;
    return register(id);
  }, [active, id, register]);

  const registered = stack.includes(id);
  return {
    isTopmost: active && (!registered || isTopOverlay(stack, id)),
  };
}
