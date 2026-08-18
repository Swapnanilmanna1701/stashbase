import * as React from "react"

import { cn } from "@/common/lib/utils"

/**
 * Thin styled wrapper over the native `<select>`. This app deliberately
 * uses native selects — the OS popup handles collision, keyboard, and
 * accessibility — so the primitive only standardizes the closed control's
 * chrome (h-8 row height, input border, translucent focus halo).
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Select }
