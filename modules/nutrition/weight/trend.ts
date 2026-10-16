// Weight trend (PRD F4, ARCHITECTURE.md "Weight trend"): an exponentially
// weighted moving average over weigh-ins, alpha from app_config
// "weight_trend". Pure. Weights are stored in kg; units convert at the edge.

import { addDays } from "@/core/time/local-day"

export const LB_PER_KG = 2.20462
export const DEFAULT_TREND_ALPHA = 0.1

export type Units = "imperial" | "metric"

export interface WeighIn {
  date: string
  kg: number
}

export interface TrendPoint extends WeighIn {
  trendKg: number
}

/** Reads app_config "weight_trend", falling back to the default alpha. */
export function trendAlpha(value: unknown): number {
  const alpha = (value as { alpha?: unknown } | null)?.alpha
  return typeof alpha === "number" && alpha > 0 && alpha <= 1 ? alpha : DEFAULT_TREND_ALPHA
}

/** Trend value at each weigh-in, oldest first. The first trend is the first weigh-in. */
export function ewma(weighIns: WeighIn[], alpha: number = DEFAULT_TREND_ALPHA): TrendPoint[] {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date))
  let trend: number | null = null
  return sorted.map((w) => {
    trend = trend === null ? w.kg : trend + alpha * (w.kg - trend)
    return { ...w, trendKg: trend }
  })
}

/** The latest trend value on or before a date. */
export function trendOn(points: TrendPoint[], date: string): number | null {
  let found: number | null = null
  for (const p of points) if (p.date <= date) found = p.trendKg
  return found
}

/**
 * Trend on `date` and its change over the previous `days` days. The change
 * is null when there is no trend value from before the window.
 */
export function trendChange(points: TrendPoint[], date: string, days: number): { trendKg: number; changeKg: number | null } | null {
  const now = trendOn(points, date)
  if (now === null) return null
  const before = trendOn(points, addDays(date, -days))
  return { trendKg: now, changeKg: before === null ? null : now - before }
}

export function toDisplay(kg: number, units: Units): number {
  return units === "metric" ? kg : kg * LB_PER_KG
}

export function fromDisplay(value: number, units: Units): number {
  return units === "metric" ? value : value / LB_PER_KG
}

export function unitLabel(units: Units): "lb" | "kg" {
  return units === "metric" ? "kg" : "lb"
}

/** "182.4 lb" */
export function formatWeight(kg: number, units: Units): string {
  return `${toDisplay(kg, units).toFixed(1)} ${unitLabel(units)}`
}

/** Under this much change reads as no change (0.2 lb, 0.1 kg; docs/PROGRESS_SPEC.md 5). */
function noChangeKg(units: Units): number {
  return units === "metric" ? 0.1 : 0.2 / LB_PER_KG
}

/**
 * The change phrase after "Trend 182.4 lb, ": "down 0.6 this week",
 * "up 0.6 this week" or "no change this week". `period` is "this week" on
 * Today and "in 30 days" on Progress.
 */
export function changePhrase(changeKg: number, units: Units, period: string): string {
  if (Math.abs(changeKg) < noChangeKg(units)) return `no change ${period}`
  const amount = Math.abs(toDisplay(changeKg, units)).toFixed(1)
  return `${changeKg < 0 ? "down" : "up"} ${amount} ${period}`
}
