// Pure helpers for the confirmation card: weight units and recalculating an
// item when the user changes its amount or swaps its food (PRD F2).

import type { DraftAlternative, DraftItem } from "../parsing/service"

export type WeightUnit = "g" | "oz"
export const GRAMS_PER_OZ = 28.3495

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
  const next = withGrams({ ...item, match: food, foodItemId, state: food.state ?? item.state }, item.grams)
  const amountFlag = item.flagReason === "amount" || (item.flagReason === "match" && item.amountSource === "estimated")
  return {
    ...next,
    alternatives: [...(item.match ? [{ ...item.match, foodItemId: item.foodItemId }] : []), ...item.alternatives].filter((a) => a.sourceId !== alternative.sourceId),
    flagged: amountFlag,
    flagReason: amountFlag ? "amount" : null,
  }
}

export function totals(items: Pick<DraftItem, "calories" | "proteinG">[]): { calories: number; proteinG: number } {
  return items.reduce((t, i) => ({ calories: t.calories + i.calories, proteinG: round1(t.proteinG + i.proteinG) }), { calories: 0, proteinG: 0 })
}
