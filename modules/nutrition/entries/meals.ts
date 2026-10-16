// Meals on Today v2 (docs/TODAY_SPEC.md 6). Pure, used by the server and the
// browser. Windows live in app_config ("meal_windows"); these are the seeded
// defaults.

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const
export type Meal = (typeof MEALS)[number]

export const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" }
/** Section headings on Today; the chip says "Snack", the section "Snacks". */
export const SECTION_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" }

/** Local hour windows, start inclusive and end exclusive. Anything else is a snack. */
export type MealWindows = Record<Exclude<Meal, "snack">, [number, number]>

export const DEFAULT_MEAL_WINDOWS: MealWindows = { breakfast: [4, 11], lunch: [11, 16], dinner: [16, 22] }

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value)
}

/** Reads app_config "meal_windows", falling back to the defaults for anything missing or malformed. */
export function mealWindows(value: unknown): MealWindows {
  const v = (value ?? {}) as Partial<Record<string, unknown>>
  const pick = (meal: keyof MealWindows): [number, number] => {
    const w = v[meal]
    return Array.isArray(w) && w.length === 2 && w.every((n) => Number.isInteger(n) && n >= 0 && n <= 24) ? [w[0], w[1]] : DEFAULT_MEAL_WINDOWS[meal]
  }
  return { breakfast: pick("breakfast"), lunch: pick("lunch"), dinner: pick("dinner") }
}

/** The meal for an instant by its local hour in the user's timezone. */
export function mealFor(instant: Date | string, timezone: string, windows: MealWindows = DEFAULT_MEAL_WINDOWS): Meal {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date(instant)))
  for (const meal of ["breakfast", "lunch", "dinner"] as const) {
    const [start, end] = windows[meal]
    if (hour >= start && hour < end) return meal
  }
  return "snack"
}

/** Local times a past day log is stamped at when a meal is chosen (Q52). */
export type MealAnchors = Record<Meal, string>

export const DEFAULT_MEAL_ANCHORS: MealAnchors = { breakfast: "08:00", lunch: "12:30", dinner: "18:30", snack: "15:00" }

/** Reads app_config "meal_anchors", falling back to the defaults for anything missing or malformed. */
export function mealAnchors(value: unknown): MealAnchors {
  const v = (value ?? {}) as Partial<Record<string, unknown>>
  const pick = (meal: Meal): string => {
    const t = v[meal]
    return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : DEFAULT_MEAL_ANCHORS[meal]
  }
  return { breakfast: pick("breakfast"), lunch: pick("lunch"), dinner: pick("dinner"), snack: pick("snack") }
}
