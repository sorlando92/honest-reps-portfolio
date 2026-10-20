// Card rows that do not come from P1: a food picked in search, or a food the
// user entered by hand (PRD F2 "manual entry"). Pure, so they are unit tested.

import type { FoodResult } from "../foods/search"
import type { DraftAlternative, DraftItem } from "../parsing/service"
import type { Per100g } from "../parsing/usda"
import { qualityIssue } from "../foods/label"
import { swapped, withServings } from "./amounts"

const round1 = (n: number) => Math.round(n * 10) / 10

/** Per 100 g values with zeros for anything missing (curated servings without a weight have none). */
function per100g(r: FoodResult): Per100g {
  const p = r.per100g as Partial<Per100g>
  return { kcal: p.kcal ?? 0, protein_g: p.protein_g ?? 0, carbs_g: p.carbs_g ?? 0, fat_g: p.fat_g ?? 0 }
}

/** A search result as a food the card can match to. Only label foods carry a serving. */
function toAlternative(r: FoodResult): DraftAlternative {
  return {
    foodItemId: r.foodItemId,
    source: r.source,
    sourceId: r.sourceId,
    name: r.name,
    brand: r.brand,
    dataType: r.dataType,
    state: r.state,
    per100g: per100g(r),
    ...(r.serving ? { serving: r.serving } : {}),
  }
}

/** Grams for a generic food with no common portion, until the user weighs it. */
const SEARCH_DEFAULT_GRAMS = 100

/**
 * A searched food as a card row (PRD F2, PM 2026-10-15). A food with a
 * published serving (chain menu, product label) starts at one serving and
 * steps in servings. A generic food starts at USDA's first common portion
 * ("1 medium", "1 cup"), else 100 g, marked estimated, so the row shows
 * "Estimated" and "Weigh it" until the user enters the real amount.
 */
export function fromSearchResult(r: FoodResult): DraftItem {
  const { foodItemId, ...match } = toAlternative(r)
  const base = { name: r.name, brand: r.brand, state: r.state, match, matchScore: 1, foodItemId, alternatives: [] }

  if (r.serving) {
    // FOOD_LOOKUP_SPEC 3 "Data quality": a product whose numbers do not add up gets "Check this".
    const issue = isProduct(r) ? qualityIssue(r.serving) : null
    return withServings(
      {
        ...base,
        serving: r.serving,
        quantity: 1,
        unit: "serving",
        grams: r.serving.grams ?? 0,
        amountSource: "label",
        confidence: 1,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        flagged: issue !== null,
        flagReason: issue ? "match" : null,
      },
      1
    )
  }
  // A product with no serving size is a label food missing its label.
  if (isProduct(r)) {
    const item = genericItem(r, base, match.per100g)
    return { ...item, flagged: true, flagReason: "match" }
  }
  return genericItem(r, base, match.per100g)
}

/** Packaged products: Open Food Facts, FDC Branded and custom foods (not curated chain menus). */
function isProduct(r: FoodResult): boolean {
  return r.source === "off" || r.source === "user" || r.dataType === "Branded"
}

type ItemBase = Pick<DraftItem, "name" | "brand" | "state" | "match" | "matchScore" | "foodItemId" | "alternatives">

function genericItem(r: FoodResult, base: ItemBase, per: Per100g): DraftItem {
  const grams = r.portion?.grams ?? SEARCH_DEFAULT_GRAMS
  const f = grams / 100
  return {
    ...base,
    quantity: grams,
    unit: "g",
    grams,
    amountSource: "estimated",
    confidence: 0.6,
    calories: Math.round(per.kcal * f),
    proteinG: round1(per.protein_g * f),
    carbsG: round1(per.carbs_g * f),
    fatG: round1(per.fat_g * f),
    flagged: true,
    flagReason: "amount",
  }
}

export interface ManualFood {
  name: string
  grams: number
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** A food typed in by hand: the user gave its weight, so it is weighed. */
export function fromManual(m: ManualFood): DraftItem {
  const grams = round1(m.grams)
  return {
    name: m.name.trim(),
    brand: null,
    quantity: grams,
    unit: "g",
    grams,
    amountSource: "weighed",
    state: null,
    confidence: 1,
    // Per 100 g from what was typed, so changing the amount scales correctly.
    match: null,
    matchScore: 1,
    calories: Math.round(m.calories),
    proteinG: round1(m.proteinG),
    carbsG: round1(m.carbsG),
    fatG: round1(m.fatG),
    flagged: false,
    flagReason: null,
    foodItemId: null,
    alternatives: [],
  }
}


/**
 * Change food on a row: the picked food replaces the match at the row's
 * current amount, and a "Check this" flag is resolved. The user's own name
 * for the row stays, with the new food shown beneath it.
 */
export function changedFood(item: DraftItem, r: FoodResult): DraftItem {
  return swapped(item, toAlternative(r))
}
