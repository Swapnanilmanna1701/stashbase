import { ToggleGroup } from "@base-ui/react/toggle-group"
import { Toggle } from "@base-ui/react/toggle"

import { cn } from "@/common/lib/utils"

/**
 * Single-select segmented control. Exactly one segment stays pressed —
 * Base UI ToggleGroup with deselection disallowed, so the group behaves
 * like the Settings appearance pickers rather than a free toggle bar.
 */
function SegmentedControl({
  className,
  ...props
}: ToggleGroup.Props) {
  return (
    <ToggleGroup
      data-slot="segmented-control"
      multiple={false}
      className={cn(
        "inline-flex items-stretch gap-px rounded-md border border-border bg-pane p-px",
        className
      )}
      {...props}
    />
  )
}

function SegmentedControlItem({ className, ...props }: Toggle.Props) {
  return (
    <Toggle
      data-slot="segmented-control-item"
      className={cn(
        // Nested-radius rule: the track is rounded-md with 1px of padding,
        // so the thumb has to sit exactly one pixel tighter or the two
        // curves visibly disagree. Derived, never a literal — the track
        // and thumb must move together when the scale changes.
        "flex-1 rounded-[calc(var(--radius-md)-1px)] border-0 bg-transparent px-2.5 py-1 text-base whitespace-nowrap text-muted-foreground transition-colors outline-none select-none",
        "hover:text-foreground",
        "focus-visible:relative focus-visible:z-1 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus",
        "data-pressed:bg-background data-pressed:font-medium data-pressed:text-foreground data-pressed:shadow-low",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem }
