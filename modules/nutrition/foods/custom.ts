// Custom foods (docs/FOOD_LOOKUP_SPEC.md 4): created by label scan or "Enter
// it yourself", private to the user. Pure: the form and the API share it.

import { z } from "zod"
import type { Serving } from "../parsing/parse-meal"
import { candidates } from "./gtin"

const OZ = 28.3495

export const SERVING_UNITS = ["g", "oz", "ml"] as const
export type ServingUnit = (typeof SERVING_UNITS)[number]

export const customFoodInput = z.object({
  name: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(200).nullable(),
  /** Any barcode form; stored as the canonical GTIN-14. Must pass its check digit. */
  gtin: z.string().trim().max(20).nullable(),
  /** The label's words for one serving ("1 scoop"); optional. */
  servingLabel: z.string().trim().max(100).nullable(),
  servingSize: z.number().positive().max(5000),
  servingUnit: z.enum(SERVING_UNITS),
  calories: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
})

export type CustomFoodInput = z.infer<typeof customFoodInput>

const round1 = (n: number) => Math.round(n * 10) / 10

/** Grams in one serving; milliliters count as grams, like FDC's liquids. */
export function servingGrams(size: number, unit: ServingUnit): number {
  return round1(unit === "oz" ? size * OZ : size)
}

/** The serving's label: "1 scoop (34 g)", or just "34 g". */
export function servingLabelOf(input: Pick<CustomFoodInput, "servingLabel" | "servingSize" | "servingUnit">): string {
  const size = `${round1(input.servingSize)} ${input.servingUnit}`
  return input.servingLabel ? `${input.servingLabel} (${size})` : size
}

/**
 * The food_items columns for a custom food: the label serving as entered,
 * and per 100 g from it so a changed amount scales. Null when the barcode
 * fails its check digit.
 */
export function customFoodColumns(input: CustomFoodInput): { name: string; brand: string | null; barcode: string | null; serving: Serving; per_100g: Record<string, number> } | null {
  let barcode: string | null = null
  if (input.gtin) {
    barcode = candidates(input.gtin)[0] ?? null
    if (!barcode) return null
  }
  const grams = servingGrams(input.servingSize, input.servingUnit)
  const f = 100 / grams
  return {
    name: input.name,
    brand: input.brand || null,
    barcode,
    serving: { label: servingLabelOf(input), grams, kcal: round1(input.calories), protein_g: round1(input.proteinG), carbs_g: round1(input.carbsG), fat_g: round1(input.fatG) },
    per_100g: { kcal: round1(input.calories * f), protein_g: round1(input.proteinG * f), carbs_g: round1(input.carbsG * f), fat_g: round1(input.fatG * f) },
  }
}
