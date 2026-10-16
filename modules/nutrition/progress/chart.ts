// Chart math for Progress (docs/PROGRESS_SPEC.md). Pure.

import type { DayTotals } from "../days/week"
import { LB_PER_KG, type Units } from "../weight/trend"
import type { ProgressSummary } from "./types"

export interface BarSegments {
  /** Calories from each macro, bottom to top, scaled to fit the bar. */
  protein: number
  carbs: number
  fat: number
  /** Logged calories the macros do not explain (alcohol, rounding). */
  other: number
}

/**
 * Bar segments for a day: protein x 4, carbs x 4, fat x 9, plus a neutral
 * remainder when logged calories exceed the macro sum. When the macro sum
 * exceeds logged calories, the segments scale down to the bar.
 */
export function barSegments(d: Pick<DayTotals, "calories" | "proteinG" | "carbsG" | "fatG">): BarSegments {
  const protein = d.proteinG * 4
  const carbs = d.carbsG * 4
  const fat = d.fatG * 9
  const sum = protein + carbs + fat
  if (sum <= 0) return { protein: 0, carbs: 0, fat: 0, other: Math.max(0, d.calories) }
  if (sum >= d.calories) {
    const k = d.calories / sum
    return { protein: protein * k, carbs: carbs * k, fat: fat * k, other: 0 }
  }
  return { protein, carbs, fat, other: d.calories - sum }
}

/** Top of the week chart's y axis: the larger of the highest bar and target, plus 10%. */
export function yMax(week: DayTotals[]): number {
  const top = Math.max(0, ...week.map((d) => Math.max(d.calories, d.target?.calories ?? 0)))
  return top > 0 ? top * 1.1 : 2000
}

/** 3 gridline values, rounded to a readable step. */
export function gridlines(max: number): number[] {
  const step = [100, 250, 500, 1000, 2000].find((s) => max / 3 <= s * 1.5) ?? 2500
  const lines: number[] = []
  for (let v = step; v < max && lines.length < 3; v += step) lines.push(v)
  return lines.length ? lines : [Math.round(max / 2)]
}

/** The default selected day: today in the current week, Sunday in past weeks. */
export function defaultSelected(weekStart: string, week: DayTotals[], today: string): string {
  const sunday = week[6]?.date ?? weekStart
  return today >= weekStart && today <= sunday ? today : sunday
}

/** "This week", otherwise "Oct 6 to Oct 12". */
export function weekLabel(weekStart: string, today: string, sunday: string): string {
  if (today >= weekStart && today <= sunday) return "This week"
  const f = (d: string) => {
    const [y, m, day] = d.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, day)))
  }
  return `${f(weekStart)} to ${f(sunday)}`
}

/** "Down 1.4 lb in 30 days", "Up 0.6 lb in 30 days", "No change in 30 days" (within 0.2 lb). */
export function rangeChangeText(changeKg: number, units: Units, days: number): string {
  const threshold = units === "metric" ? 0.1 : 0.2 / LB_PER_KG
  if (Math.abs(changeKg) < threshold) return `No change in ${days} days`
  const amount = Math.abs(units === "metric" ? changeKg : changeKg * LB_PER_KG).toFixed(1)
  return `${changeKg < 0 ? "Down" : "Up"} ${amount} ${units === "metric" ? "kg" : "lb"} in ${days} days`
}

/**
 * Trend change over the weight range: latest trend minus the trend just
 * before the range, or minus the first trend in the range when there is none.
 * Null with fewer than 2 weigh-ins and no earlier trend.
 */
export function rangeChangeKg(weight: ProgressSummary["weight"]): number | null {
  const pts = weight.points
  if (pts.length === 0) return null
  const last = pts[pts.length - 1].trendKg
  if (weight.trendBeforeKg !== null) return last - weight.trendBeforeKg
  return pts.length >= 2 ? last - pts[0].trendKg : null
}

/** Weight axis bounds, padded 2 lb (1 kg) above and below the data. */
export function weightBounds(values: number[], units: Units): [number, number] {
  const pad = units === "metric" ? 1 : 2 / LB_PER_KG
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return [lo - pad, hi + pad]
}
