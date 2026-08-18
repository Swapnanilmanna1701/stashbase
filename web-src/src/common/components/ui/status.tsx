import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/common/lib/utils"

const statusVariants = cva(
  "rounded-md border px-3 py-2 text-sm",
  {
    variants: {
      tone: {
        info: "border-status-info/30 bg-status-info/10 text-foreground",
        success: "border-status-success/30 bg-status-success/10 text-foreground",
        warning: "border-status-warning/30 bg-status-warning/10 text-foreground",
        error: "border-status-danger/30 bg-status-danger/10 text-foreground",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  }
)

function StatusMessage({
  className,
  tone = "info",
  role,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof statusVariants>) {
  const semanticRole = role ?? (tone === "error" ? "alert" : "status")
  return (
    <div
      data-slot="status-message"
      role={semanticRole}
      aria-live={semanticRole === "alert" ? "assertive" : "polite"}
      className={cn(statusVariants({ tone }), className)}
      {...props}
    />
  )
}

function ModalLoadingStatus({
  label,
  isTopmost,
  onCancel,
  closeOnBackdrop = false,
}: {
  label: string
  isTopmost: boolean
  onCancel: () => void
  closeOnBackdrop?: boolean
}) {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null)

  React.useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return undefined
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      tabIndex={-1}
      className="m-auto border-0 bg-transparent p-0 text-foreground outline-none backdrop:bg-veil"
      onCancel={(event) => {
        event.preventDefault()
        if (isTopmost) onCancel()
      }}
      onClick={(event) => {
        if (
          closeOnBackdrop
          && isTopmost
          && event.target === event.currentTarget
        ) {
          onCancel()
        }
      }}
    >
      <StatusMessage className="min-w-48 bg-popover text-center text-popover-foreground shadow-elevation">
        {label}
      </StatusMessage>
    </dialog>
  )
}

function PopupLoadingStatus({
  label,
  left,
  top,
  onCancel,
}: {
  label: string
  left: number
  top: number
  onCancel: () => void
}) {
  const statusRef = React.useRef<HTMLDivElement | null>(null)
  const returnFocusRef = React.useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  )

  React.useLayoutEffect(() => {
    statusRef.current?.focus({ preventScroll: true })
    return () => {
      if (
        document.activeElement === statusRef.current
        && returnFocusRef.current?.isConnected
      ) {
        returnFocusRef.current.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={cn(
          statusVariants({ tone: "info" }),
          "absolute bg-card text-xs text-muted-foreground shadow-elevation outline-none"
        )}
        style={{ left, top }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "Tab") return
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }}
      >
        {label}
      </div>
    </div>
  )
}

export {
  ModalLoadingStatus,
  PopupLoadingStatus,
  StatusMessage,
  statusVariants,
}
