"use client"

import { useRouter } from "next/navigation"
import { track } from "@/core/events/client"
import { daysBetween } from "../../days/week"

/** The Today URL for a local date; today itself is plain /today. */
export function todayHref(date: string, today: string): string {
  return date === today ? "/today" : `/today?date=${date}`
}

/** Moves Today to another day and records day_switched (PRD section 5). */
export function useGoToDay(today: string, current: string) {
  const router = useRouter()
  return (date: string) => {
    if (date > today || date === current) return
    track("day_switched", { days_from_today: daysBetween(today, date) })
    router.push(todayHref(date, today), { scroll: false })
  }
}
