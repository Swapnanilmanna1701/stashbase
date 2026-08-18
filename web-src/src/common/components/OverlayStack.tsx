import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
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

interface OverlayStackContextValue {
  stack: OverlayStackState;
  register: (id: string) => () => void;
}

const OverlayStackContext = createContext<OverlayStackContextValue | null>(null);

export function OverlayStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<OverlayStackState>([]);
  const register = useCallback((id: string) => {
    setStack((current) => registerOverlay(current, id));
    return () => {
      setStack((current) => unregisterOverlay(current, id));
    };
  }, []);
  const value = useMemo(() => ({ stack, register }), [register, stack]);

  return (
    <OverlayStackContext.Provider value={value}>
      {children}
    </OverlayStackContext.Provider>
  );
}

/**
 * Registers one blocking surface for as long as it is active. A newly
 * committed surface is provisionally topmost until its layout effect records
 * it; this closes the pre-paint gap without exposing registration details.
 */
export function useOverlayLayer(active: boolean) {
  const context = useContext(OverlayStackContext);
  if (!context) throw new Error('useOverlayLayer must be used inside OverlayStackProvider');
  const id = useId();
  const { register, stack } = context;

  useLayoutEffect(() => {
    if (!active) return undefined;
    return register(id);
  }, [active, id, register]);

  const registered = stack.includes(id);
  return {
    isTopmost: active && (!registered || isTopOverlay(stack, id)),
  };
}
