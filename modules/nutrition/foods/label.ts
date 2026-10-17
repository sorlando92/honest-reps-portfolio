// Label foods (packaged products, custom foods): their serving line, tidy
// names from FDC's capitals, and the data quality rule (docs/FOOD_LOOKUP_SPEC.md
// 3 "Data quality"). Pure: used by the server and the browser, unit tested.

import type { Serving } from "../parsing/parse-meal"

const round1 = (n: number) => Math.round(n * 10) / 10

/** Words kept in capitals when FDC's all caps text is tidied. */
const KEEP_UPPER = new Set(["bbq", "usa", "uk", "xl", "xxl", "ii", "iii", "mct", "bcaa", "ufc", "gmo"])

/**
 * "NATIVE FUEL WHEY, CHOCOLATE" to "Native Fuel Whey, Chocolate". Text that
 * is not all capitals is returned as is.
 */
export function tidyCase(text: string): string {
  const t = text.trim()
  if (!t || t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t
  return t.toLowerCase().replace(/[a-z0-9][a-z0-9']*/g, (word) => (KEEP_UPPER.has(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
}

/**
 * The household text FDC stores is often cut short ("1 PO", "1 R"); only a
 * real phrase is worth showing.
 */
function usableHousehold(text: string | null): string | null {
  const t = text?.trim() ?? ""
  if (t.length < 5 || !/[a-z]{3}/i.test(t)) return null
  if (/^(amount per serving|serving size)$/i.test(t)) return null
  return t === t.toUpperCase() ? t.toLowerCase() : t
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(round1(n)))

/**
 * A branded product's label serving from FDC's serving size, unit and
 * household text: "1 rounded scoop (31 g)". Milliliters count as grams for
 * the card's gram field (water density); the label keeps the ml.
 */
export function brandedServing(
  per100g: { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number },
  size: number | null,
  unit: string | null,
  household: string | null
): Serving | null {
  if (!size || !(size > 0) || (unit !== "g" && unit !== "ml")) return null
  const amount = `${fmt(size)} ${unit}`
  const words = usableHousehold(household)
  const f = size / 100
  return {
    label: words ? `${words} (${amount})` : amount,
    grams: size,
    kcal: round1((per100g.kcal ?? 0) * f),
    protein_g: round1((per100g.protein_g ?? 0) * f),
    carbs_g: round1((per100g.carbs_g ?? 0) * f),
    fat_g: round1((per100g.fat_g ?? 0) * f),
  }
}

export type QualityIssue = "no_serving" | "calories_mismatch"

/** Calories from the macros, by the Atwater factors on US labels. */
export function macroCalories(s: { protein_g: number; carbs_g: number; fat_g: number }): number {
  return 4 * s.protein_g + 4 * s.carbs_g + 9 * s.fat_g
}

/**
 * Why a label food needs a second look, or null: no serving size, or calories
 * more than 20% away from 4 x protein + 4 x carbs + 9 x fat.
 */
export function qualityIssue(serving: Pick<Serving, "grams" | "kcal" | "protein_g" | "carbs_g" | "fat_g"> | null): QualityIssue | null {
  if (!serving || !serving.grams) return "no_serving"
  const fromMacros = macroCalories(serving)
  const kcal = serving.kcal
  if (kcal <= 0 && fromMacros <= 0) return null
  const base = Math.max(kcal, fromMacros)
  return Math.abs(kcal - fromMacros) / base > 0.2 ? "calories_mismatch" : null
}

/** The confirmation line: "Ascent Native Fuel Whey, Chocolate. 1 scoop (34 g), 130 kcal." */
export function servingLine(serving: Pick<Serving, "label" | "kcal"> | null): string | null {
  if (!serving) return null
  return `${serving.label}, ${Math.round(serving.kcal)} kcal`
}
