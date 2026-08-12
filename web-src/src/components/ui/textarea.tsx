import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea
    data-slot="textarea"
    className={cn(
      'w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground transition-colors outline-none',
      'placeholder:text-placeholder focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
      'disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
      className,
    )}
    {...props}
  />;
}

export { Textarea };
