import * as React from "react"
import {
  Toast as ToastPrimitive,
  type ToastManagerAddOptions,
  type ToastManagerUpdateOptions,
} from "@base-ui/react/toast"
import { CloseIcon } from "@/common/components/icons"

import { cn } from "@/common/lib/utils"
import { Button } from "@/common/components/ui/button"
import type {
  ToastLevel,
  ToastOptions,
} from "@/common/lib/feedbackToasts"

export type { ToastLevel, ToastOptions }

export interface FeedbackToastData {
  level: ToastLevel
  count: number
  dedupeKey: string
  action?: ToastOptions["action"]
}

interface ToastManagerPort {
  add(options: ToastManagerAddOptions<FeedbackToastData>): string
  update(id: string, options: ToastManagerUpdateOptions<FeedbackToastData>): void
  close(id?: string): void
}

export const feedbackToastPolicy = {
  info: {
    timeout: 3000,
    priority: "low",
    accentClass: "border-l-status-info",
  },
  success: {
    timeout: 3000,
    priority: "low",
    accentClass: "border-l-status-success",
  },
  warning: {
    timeout: 5000,
    priority: "high",
    accentClass: "border-l-status-warning",
  },
  error: {
    timeout: 0,
    priority: "high",
    accentClass: "border-l-status-danger",
  },
} as const satisfies Record<
  ToastLevel,
  {
    timeout: number
    priority: "high" | "low"
    accentClass: string
  }
>

export function createFeedbackToastController(manager: ToastManagerPort) {
  const visibleByKey = new Map<
    string,
    { id: string; count: number; action?: ToastOptions["action"] }
  >()

  function show(message: string, options?: ToastOptions, requestedId?: string): string {
    const level = options?.level ?? "info"
    const policy = feedbackToastPolicy[level]
    const timeout = options?.ttl !== undefined
      ? options.ttl ?? 0
      : policy.timeout
    const dedupeKey = `${level}\u0000${message}`
    const visible = visibleByKey.get(dedupeKey)

    if (visible) {
      visible.count += 1
      if (options?.action) visible.action = options.action
      manager.update(visible.id, {
        description: message,
        timeout,
        priority: policy.priority,
        data: {
          level,
          count: visible.count,
          dedupeKey,
          action: visible.action,
        },
      })
      return visible.id
    }

    let id = ""
    const forget = () => {
      if (visibleByKey.get(dedupeKey)?.id === id) visibleByKey.delete(dedupeKey)
    }
    id = manager.add({
      id: requestedId,
      description: message,
      timeout,
      priority: policy.priority,
      type: level,
      data: { level, count: 1, dedupeKey, action: options?.action },
      onClose: forget,
      onRemove: forget,
    })
    visibleByKey.set(dedupeKey, { id, count: 1, action: options?.action })
    return id
  }

  return {
    show,
    dismiss: (id: string) => manager.close(id),
    clear: () => manager.close(),
  }
}

export const toastManager = ToastPrimitive.createToastManager<FeedbackToastData>()
export const managedFeedbackToasts = createFeedbackToastController(toastManager)

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastPrimitive.Provider
      toastManager={toastManager}
      limit={8}
      {...props}
    />
  )
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function useFeedbackToastManager() {
  return ToastPrimitive.useToastManager<FeedbackToastData>()
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "scrollbar-quiet fixed right-4 bottom-4 z-[9000] flex max-h-[min(60vh,480px)] w-[min(360px,calc(100vw-32px))] flex-col gap-2 overflow-y-auto p-0.5 outline-none",
        className
      )}
      {...props}
    />
  )
}

function ToastRoot({
  className,
  toast,
  ...props
}: ToastPrimitive.Root.Props) {
  const data = toast.data as FeedbackToastData | undefined
  const level = data?.level ?? "info"
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      toast={toast}
      swipeDirection={["down", "right"]}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border border-l-2 bg-background px-3 py-2.5 text-base leading-snug text-foreground shadow-elevation outline-none transition-[opacity,transform] duration-standard ease-ui data-[starting-style]:translate-y-1.5 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-1.5 data-[ending-style]:opacity-0",
        feedbackToastPolicy[level].accentClass,
        className
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn("flex min-w-0 flex-1 items-start gap-2 overflow-hidden", className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("min-w-0 flex-1 break-words", className)}
      {...props}
    />
  )
}

function ToastAction({ className, ...props }: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        "shrink-0 rounded border border-border bg-background px-2 py-0.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Dismiss notification"
      className={cn(
        "shrink-0 rounded-sm border-0 bg-transparent p-0.5 text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      <CloseIcon className="size-3.5" aria-hidden="true" />
    </ToastPrimitive.Close>
  )
}

function ToastClearAll({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  if (count <= 1) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={cn("self-end shadow-elevation", className)}
      onClick={() => managedFeedbackToasts.clear()}
    >
      Clear all ({count})
    </Button>
  )
}

export {
  ToastAction,
  ToastClearAll,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastRoot,
  ToastViewport,
  useFeedbackToastManager,
}
