"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { isQuickAction, QUICK_ACTION_EVENT, type QuickAction } from "@/components/nav/quick-actions"
import { addDays } from "@/core/time/local-day"
import { mealFor, SECTION_LABEL, type MealWindows } from "../../entries/meals"
import { focusNote, openLog, openWeight } from "./today-events"

/**
 * Carries out the "+" sheet's actions on the selected day (NAV_SPEC 2): from
 * the sheet on Today, or from `?qa=` when another tab sent the user here.
 * Rendered after the journal's parts, so their listeners are ready first.
 */
export function TodayQuickActions({ date, timezone, mealWindows }: { date: string; timezone: string; mealWindows: MealWindows }) {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState("")
  const handled = useRef<string | null>(null)

  const run = useCallback(
    (action: QuickAction) => {
      if (action === "search") return openLog("search")
      if (action === "scan") return openLog("scan")
      if (action === "weight") return openWeight()
      if (action === "note") return focusNote()
      void (async () => {
        const meal = mealFor(new Date(), timezone, mealWindows)
        const name = SECTION_LABEL[meal].toLowerCase()
        setStatus("")
        const res = await fetch("/api/meals/copy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fromDate: addDays(date, -1), meal, toDate: date }),
        }).catch(() => null)
        if (!res?.ok) return setStatus("Not copied. Try again.")
        const { copied } = (await res.json()) as { copied: number }
        setStatus(copied > 0 ? "Copied." : `Nothing in yesterday's ${name} to copy.`)
        router.refresh()
      })()
    },
    [date, timezone, mealWindows, router]
  )

  useEffect(() => {
    const onAction = (e: Event) => run((e as CustomEvent<QuickAction>).detail)
    window.addEventListener(QUICK_ACTION_EVENT, onAction)
    return () => window.removeEventListener(QUICK_ACTION_EVENT, onAction)
  }, [run])

  // From another tab: /today?qa=weight runs once, then the URL is cleaned up.
  const qa = params.get("qa")
  useEffect(() => {
    if (!isQuickAction(qa) || handled.current === qa) return
    handled.current = qa
    run(qa)
    router.replace("/today", { scroll: false })
  }, [qa, run, router])

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(""), 4000)
    return () => clearTimeout(t)
  }, [status])

  return (
    <p
      role="status"
      aria-live="polite"
      className={status ? "fixed inset-x-4 top-[calc(env(safe-area-inset-top)+7rem)] z-40 mx-auto max-w-sm rounded-full border border-border bg-surface px-4 py-2 text-center text-body" : "sr-only"}
    >
      {status}
    </p>
  )
}
