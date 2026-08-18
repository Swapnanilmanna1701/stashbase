import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/common/lib/utils"

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />
}

function MenuPositioner({ className, ...props }: MenuPrimitive.Positioner.Props) {
  return (
    <MenuPrimitive.Positioner
      data-slot="menu-positioner"
      // Above the modal veils (z-1200): the menu portals to <body>, so a
      // lower value leaves it stacked BEHIND whatever opened it whenever
      // the trigger lives inside a veil — the search popup's scope pill
      // did exactly that. Only the crash overlay (10000) outranks it.
      className={cn("z-1300", className)}
      {...props}
    />
  )
}

function MenuPopup({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Popup
      data-slot="menu-popup"
      className={cn(
        "flex min-w-44 flex-col gap-px rounded-xl border border-border bg-card p-1 text-base text-foreground shadow-elevation outline-none transition-[opacity,transform] duration-fast ease-ui data-[starting-style]:-translate-y-0.5 data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-0.5 data-[ending-style]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-4 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-inherit outline-none data-disabled:cursor-default data-disabled:opacity-45 data-highlighted:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("mx-1.5 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  Menu,
  MenuTrigger,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuSeparator,
}
