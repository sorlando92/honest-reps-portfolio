// When a new entry is stamped (PRD F3, Q52). Pure, used in the browser.

import { localInstant, localTime, localToday } from "@/core/time/local-day"
import type { Meal, MealAnchors } from "./meals"

/**
 * Today: now. A past day: that date at the chosen meal's anchor time, or at
 * the current clock time when no meal was chosen (it then auto-files by
 * that time, as on today).
 */
export function loggedAtFor(date: string, meal: Meal | null, timezone: string, anchors: MealAnchors, now: Date = new Date()): Date {
  if (date >= localToday(timezone, now)) return now
  return localInstant(date, meal ? anchors[meal] : localTime(now, timezone), timezone)
}
