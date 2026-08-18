import {
  Suspense,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { lazyWithRetry } from '@/common/components/ErrorBoundary';

export interface TooltipButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

const ManagedTooltipButton = lazyWithRetry(() => import('@/common/components/ManagedTooltipButton'));

interface FocusTransferRef {
  current: boolean;
}

/**
 * The accessible button is available immediately. Only its supplementary
 * visual tooltip is deferred, keeping Base UI positioning out of startup JS.
 */
export function TooltipButton(props: TooltipButtonProps) {
  const focusTransferRef = useRef(false);
  return (
    <Suspense
      fallback={(
        <TooltipButtonFallback {...props} focusTransferRef={focusTransferRef} />
      )}
    >
      <ManagedTooltipButton {...props} focusTransferRef={focusTransferRef} />
    </Suspense>
  );
}

function TooltipButtonFallback({
  label,
  children,
  focusTransferRef,
  ...buttonProps
}: TooltipButtonProps & {
  focusTransferRef: FocusTransferRef;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => () => {
    if (document.activeElement === buttonRef.current) focusTransferRef.current = true;
  }, [focusTransferRef]);

  return (
    <button
      {...buttonProps}
      ref={buttonRef}
      type={buttonProps.type ?? 'button'}
      aria-label={label}
      onFocusCapture={(event) => {
        focusTransferRef.current = true;
        buttonProps.onFocusCapture?.(event);
      }}
      onBlurCapture={(event) => {
        focusTransferRef.current = false;
        buttonProps.onBlurCapture?.(event);
      }}
    >
      {children}
    </button>
  );
}

export type { FocusTransferRef };
