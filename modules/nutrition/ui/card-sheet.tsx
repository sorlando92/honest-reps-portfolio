"use client"

import { useId, type ReactNode } from "react"
import { Dialog } from "radix-ui"

/**
 * The bottom sheet the confirmation card lives in, for new meals and for
 * editing a logged one (DESIGN_SYSTEM.md "Log confirmation").
 */
export function CardSheet({
  open,
  onOpenChange,
  title,
  summary,
  children,
  footer,
  returnFocus = true,
  onClosed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  summary: string
  children: ReactNode
  footer?: ReactNode
  /** False when an action in the sheet moves focus elsewhere (a quick action focusing the day note). */
  returnFocus?: boolean
  /** After the sheet has closed and released focus. */
  onClosed?: () => void
}) {
  const id = useId()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70" />
        <Dialog.Content
          aria-describedby={`${id}-summary`}
          onCloseAutoFocus={(e) => {
            if (!returnFocus) e.preventDefault()
            onClosed?.()
          }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[720px] flex-col rounded-t-lg border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-250 motion-reduce:animate-none"
        >
          <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
            <Dialog.Title className="text-title">{title}</Dialog.Title>
            <Dialog.Description id={`${id}-summary`} className="text-body text-text-muted tabular-nums">
              {summary}
            </Dialog.Description>
          </div>
          <div className="flex-1 overflow-y-auto px-4">{children}</div>
          {footer && <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
