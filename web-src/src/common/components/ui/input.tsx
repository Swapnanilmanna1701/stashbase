import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/common/lib/utils"

function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        // A text field is a box, not an item, so it takes the container
        // corner like every other box. It also stands a step taller than
        // any button: a button is a label you hit, a field is a space you
        // put a cursor in and read your own typing back out of, and the
        // workbench density that suits the first is cramped for the second.
        // At h-9 the corner clamps to 18 — near enough to the container's
        // 20 that a search field and the composer read as one object family
        // at two sizes, which is the whole point of the box role.
        "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground transition-colors outline-none",
        "placeholder:text-placeholder",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
