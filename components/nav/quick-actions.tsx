"use client"

import { useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CopyPlus, NotebookPen, ScanBarcode, Search, Weight, type LucideIcon } from "lucide-react"
import { track } from "@/core/events/client"
import { mealFor, MEAL_LABEL, type MealWindows } from "@/modules/nutrition/entries/meals"
import { shortDate } from "@/modules/nutrition/days/week"
import { CardSheet } from "@/modules/nutrition/ui/card-sheet"

export const QUICK_ACTIONS = ["search", "scan", "weight", "note", "copy"] as const
export type QuickAction = (typeof QUICK_ACTIONS)[number]

/** Sent on Today; the journal's handler carries the action out on the selected day. */
export const QUICK_ACTION_EVENT = "hr:quick-action"

export function isQuickAction(value: unknown): value is QuickAction {
  return typeof value === "string" && (QUICK_ACTIONS as readonly string[]).includes(value)
}

/**
 * The "+" sheet (NAV_SPEC 2). On Today the actions apply to the selected
 * day; anywhere else they apply to today and switch to Today.
 */
export function QuickActions({ open, onOpenChange, mealWindows }: { open: boolean; onOpenChange: (o: boolean) => void; mealWindows: MealWindows }) {
  const pathname = usePathname()
  const router = useRouter()
  const onToday = pathname === "/today"
  // The sheet only renders after a tap, so the URL is read directly.
  const date = onToday && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("date") : null
  // Runs once the sheet has closed, so focus can move (Day note) without the sheet taking it back.
  const pending = useRef<QuickAction | null>(null)
  // The meal for the current time window, as the journal will pick it.
  // Only while open: the server render has no clock to read.
  const meal = open ? mealFor(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone, mealWindows) : "lunch"

  const rows: { action: QuickAction; label: string; icon: LucideIcon }[] = [
    { action: "search", label: "Search food", icon: Search },
    { action: "scan", label: "Scan barcode", icon: ScanBarcode },
    { action: "weight", label: "Log weight", icon: Weight },
    { action: "note", label: "Day note", icon: NotebookPen },
    { action: "copy", label: `Copy yesterday's ${MEAL_LABEL[meal].toLowerCase()}`, icon: CopyPlus },
  ]

  function run(action: QuickAction) {
    track("quick_action_used", { action })
    pending.current = action
    onOpenChange(false)
  }

  function closed() {
    const action = pending.current
    pending.current = null
    if (!action) return
    if (onToday) window.dispatchEvent(new CustomEvent<QuickAction>(QUICK_ACTION_EVENT, { detail: action }))
    else router.push(`/today?qa=${action}`)
  }

  return (
    <CardSheet open={open} onOpenChange={onOpenChange} returnFocus={false} onClosed={closed} title="Quick actions" summary={date ? `For ${shortDate(date)}` : "For today"}>
      <ul className="flex flex-col pb-4">
        {rows.map(({ action, label, icon: Icon }) => (
          <li key={action}>
            <button type="button" onClick={() => run(action)} className="flex h-14 w-full items-center gap-4 rounded-md px-2 text-body hover:bg-surface">
              <Icon aria-hidden className="size-6 text-text-muted" strokeWidth={1.75} />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </CardSheet>
  )
}
