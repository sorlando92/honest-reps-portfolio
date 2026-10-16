// The Progress screen's data (docs/PROGRESS_SPEC.md), as progress_summary()
// returns it, in app units. Pure types, shared by the server and the browser.

import type { DayTotals } from "../days/week"
import type { Units } from "../weight/trend"

export const WEIGHT_RANGES = [7, 30, 90] as const
export type WeightRange = (typeof WEIGHT_RANGES)[number]

export function isWeightRange(n: number): n is WeightRange {
  return (WEIGHT_RANGES as readonly number[]).includes(n)
}

export interface WeekAverages {
  elapsedDays: number
  loggedDays: number
  avgCalories: number | null
  avgProteinG: number | null
  /** Null before targets exist (Q59). */
  daysOnTarget: number | null
  proteinDays: number | null
  /** 0 to 1, null with no items (Q57). */
  weighedShare: number | null
}

export interface ConsistencyDay {
  date: string
  logged: boolean
  adherent: boolean
  weighed: boolean
}

export interface WeightPoint {
  date: string
  kg: number
  trendKg: number
}

export interface ProgressSummary {
  today: string
  units: Units
  weekStart: string
  week: DayTotals[]
  averages: WeekAverages
  days30: ConsistencyDay[]
  weight: {
    rangeDays: WeightRange
    points: WeightPoint[]
    /** Trend just before the range; null when there were no weigh-ins before it. */
    trendBeforeKg: number | null
    goalKg: number | null
  }
}
