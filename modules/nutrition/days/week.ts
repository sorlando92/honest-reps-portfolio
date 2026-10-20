// Week math and day summaries for Today and Progress (docs/SCREENS_V2.md,
// docs/PROGRESS_SPEC.md). Pure, used by the server and the browser. Weeks run
// Monday to Sunday on local dates ("YYYY-MM-DD").

import { addDays } from "@/core/time/local-day"

/** One local day from daily_totals(), in app units. */
export interface DayTotals {
  date: string
  logged: boolean
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  items: number
  weighedItems: number
  /** The targets in effect on that date; null before the user had any. */
  target: { calories: number; proteinG: number; carbsG: number; fatG: number } | null
  /** Null when there was no target that day. */
  adherent: boolean | null
  proteinHit: boolean | null
  weightKg: number | null
}

/** Monday of the week a local date falls in. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 is Sunday
  return addDays(date, -((weekday + 6) % 7))
}

/** The 7 local dates of the week starting on a Monday. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Whole days from a to b (b minus a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

export interface WeekInsight {
  /** Days from Monday through the last counted day. */
  elapsed: number
  logged: number
  /** Null before targets exist (Q59). */
  onTarget: number | null
  proteinDays: number | null
}

/**
 * Counts for "This week: 4 of 6 days on target. Protein 5 of 6." over the
 * days Monday through `through` (docs/TODAY_SPEC.md 3). Null when nothing was
 * logged in those days, since the line is hidden then.
 */
export function weekInsight(days: DayTotals[], through: string): WeekInsight | null {
  const counted = days.filter((d) => d.date <= through)
  const logged = counted.filter((d) => d.logged).length
  if (logged === 0) return null
  const hasTargets = counted.some((d) => d.target !== null)
  return {
    elapsed: counted.length,
    logged,
    onTarget: hasTargets ? counted.filter((d) => d.adherent).length : null,
    proteinDays: hasTargets ? counted.filter((d) => d.proteinHit).length : null,
  }
}

export function insightText(insight: WeekInsight): string {
  if (insight.onTarget === null || insight.proteinDays === null) {
    return `This week: ${insight.logged} of ${insight.elapsed} days logged.`
  }
  return `This week: ${insight.onTarget} of ${insight.elapsed} days on target. Protein ${insight.proteinDays} of ${insight.elapsed}.`
}

/** Share of a target eaten, 0 to 1, capped at full. 0 without a target. */
export function fill(eaten: number, target: number | null | undefined): number {
  if (!target || target <= 0) return 0
  return Math.min(1, Math.max(0, eaten / target))
}

/** Streak lengths that earn a moment (docs/TODAY_SPEC.md 4). */
const STREAK_MILESTONES = [7, 14, 30, 60, 100] as const

export function isStreakMilestone(days: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(days)
}

/** "Wed, Oct 15" for a local date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** "Wednesday, October 15" for a local date. */
export function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** "W" style weekday letter for a local date. */
export function weekdayLetter(date: string): string {
  return longDate(date).charAt(0)
}

/** 1,850 */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}
