import { useLayoutEffect, useRef } from 'react';
import type {
  TooltipButtonProps,
  FocusTransferRef,
} from '@/common/components/TooltipButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/common/components/ui/tooltip';

export default function ManagedTooltipButton({
  label,
  side = 'right',
  children,
  focusTransferRef,
  ...buttonProps
}: TooltipButtonProps & {
  focusTransferRef: FocusTransferRef;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { disabled, ...triggerProps } = buttonProps;

  useLayoutEffect(() => {
    if (!focusTransferRef.current) return;
    focusTransferRef.current = false;
    triggerRef.current?.focus();
  }, [focusTransferRef]);

  return (
    <Tooltip>
      <TooltipTrigger
        {...triggerProps}
        ref={triggerRef}
        disabled={disabled}
        render={<button disabled={disabled} />}
        type={buttonProps.type ?? 'button'}
        aria-label={label}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
