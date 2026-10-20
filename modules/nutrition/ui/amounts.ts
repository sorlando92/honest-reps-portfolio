// Pure helpers for the confirmation card: weight units and recalculating an
// item when the user changes its amount or swaps its food (PRD F2).

import type { DraftAlternative, DraftItem } from "../parsing/service"

export type WeightUnit = "g" | "oz"
const GRAMS_PER_OZ = 28.3495

export function toUnit(grams: number, unit: WeightUnit): number {
  return unit === "g" ? Math.round(grams) : Math.round((grams / GRAMS_PER_OZ) * 10) / 10
}

export function fromUnit(value: number, unit: WeightUnit): number {
  return unit === "g" ? value : value * GRAMS_PER_OZ
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The item at a new weight. Uses the matched food's per 100 g values when it
 * has them, else scales what the item already has.
 */
export function withGrams(item: DraftItem, grams: number): DraftItem {
  const g = Math.max(0, grams)
  const per = item.match?.per100g
  if (per && Number.isFinite(per.kcal)) {
    const f = g / 100
    return { ...item, grams: round1(g), calories: Math.round(per.kcal * f), proteinG: round1(per.protein_g * f), carbsG: round1(per.carbs_g * f), fatG: round1(per.fat_g * f) }
  }
  const f = item.grams > 0 ? g / item.grams : 0
  return { ...item, grams: round1(g), calories: Math.round(item.calories * f), proteinG: round1(item.proteinG * f), carbsG: round1(item.carbsG * f), fatG: round1(item.fatG * f) }
}

/**
 * The user typed a weight: the amount is now weighed, and an "Estimated"
 * flag is resolved (PRD F2: flagged until the user edits or confirms it).
 */
export function weighed(item: DraftItem, grams: number): DraftItem {
  const next = withGrams(item, grams)
  return {
    ...next,
    amountSource: "weighed",
    quantity: next.grams,
    unit: "g",
    flagged: item.flagReason === "match",
    flagReason: item.flagReason === "match" ? "match" : null,
  }
}

/** The user picked another food for the row: a "Check this" flag is resolved. */
export function swapped(item: DraftItem, alternative: DraftAlternative): DraftItem {
  const { foodItemId, ...food } = alternative
  // The user's own name for the food stays; the matched food shows beneath it.
  const base: DraftItem = { ...item, match: food, foodItemId, state: food.state ?? item.state, serving: food.serving }
  let next: DraftItem
  let amountFlag = item.flagReason === "amount" || (item.flagReason === "match" && item.amountSource === "estimated")
  if (food.serving) {
    // A food with a published serving: keep the serving count, or start from
    // the servings closest to the current weight.
    const count = item.serving ? item.quantity : food.serving.grams ? Math.max(0.5, Math.round((item.grams / food.serving.grams) * 2) / 2) : 1
    next = { ...withServings(base, count), amountSource: "label" }
    amountFlag = false
  } else {
    next = withGrams({ ...base, serving: undefined, quantity: item.serving ? item.grams : item.quantity, unit: item.serving ? "g" : item.unit }, item.grams)
  }
  return {
    ...next,
    alternatives: [...(item.match ? [{ ...item.match, foodItemId: item.foodItemId }] : []), ...item.alternatives].filter((a) => a.sourceId !== alternative.sourceId),
    flagged: amountFlag,
    flagReason: amountFlag ? "amount" : null,
  }
}

/**
 * A label item at a number of servings (PRD F2 servings stepper). Nutrition
 * comes from the published serving; grams follow when the serving has a
 * weight, else they scale from what the item had.
 */
export function withServings(item: DraftItem, servings: number): DraftItem {
  const s = item.serving
  if (!s) return item
  const n = Math.max(0, Math.round(servings * 100) / 100)
  const grams = s.grams ? s.grams * n : item.quantity > 0 ? (item.grams * n) / item.quantity : item.grams
  return {
    ...item,
    quantity: n,
    unit: "serving",
    grams: round1(grams),
    calories: Math.round(s.kcal * n),
    proteinG: round1(s.protein_g * n),
    carbsG: round1(s.carbs_g * n),
    fatG: round1(s.fat_g * n),
  }
}

export function totals(items: Pick<DraftItem, "calories" | "proteinG">[]): { calories: number; proteinG: number } {
  return items.reduce((t, i) => ({ calories: t.calories + i.calories, proteinG: round1(t.proteinG + i.proteinG) }), { calories: 0, proteinG: 0 })
}

/** PRD F2: scale users see amounts in grams; others in their units' weight. */
export function defaultUnit(units: "imperial" | "metric", hasScale: boolean | null): WeightUnit {
  return hasScale || units === "metric" ? "g" : "oz"
}
