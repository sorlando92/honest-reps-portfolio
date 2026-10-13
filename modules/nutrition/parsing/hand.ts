// Hand portion conversions (PRD F14, QUESTIONS.md Q33). The coach edits them
// in nutrition_coach_settings.hand_portions; these are the seeded defaults.

export type HandKind = "palm" | "fist" | "cupped_hand" | "thumb" | "handful"

export interface HandPortions {
  palm: { grams: number }
  /** A fist is 1 cup: its weight depends on the food, so P1's estimate is kept. */
  fist: { cups: number }
  cupped_hand: { grams: number }
  thumb: { grams: number; nut_butter_grams: number }
}

export const DEFAULT_HAND_PORTIONS: HandPortions = {
  palm: { grams: 100 }, // cooked protein
  fist: { cups: 1 }, // vegetables or fruit
  cupped_hand: { grams: 90 }, // 1/2 cup cooked grains or starch
  thumb: { grams: 14, nut_butter_grams: 16 }, // 1 tbsp oil or butter; nut butter 16 g
}

const KINDS: [RegExp, HandKind][] = [
  [/\bcupped hands?\b/, "cupped_hand"],
  [/\bpalms?\b/, "palm"],
  [/\bfists?\b/, "fist"],
  [/\bthumbs?\b/, "thumb"],
  [/\bhandfuls?\b/, "handful"],
]
const COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, half: 0.5 }

/**
 * Finds the hand portion the user named for this food: the clause of the
 * meal text that mentions both a hand word and one of the food's words.
 */
export function handPortionFor(text: string, foodName: string): { kind: HandKind; count: number } | null {
  const words = foodName.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)
  const clauses = text.toLowerCase().split(/,|;|\+|\band\b|\bwith\b|\bplus\b/)
  for (const clause of clauses) {
    const kind = KINDS.find(([re]) => re.test(clause))?.[1]
    if (!kind || !words.some((w) => clause.includes(w))) continue
    const before = clause.split(/palm|fist|cupped|thumb|handful/)[0].trim().split(/\s+/)
    const last = before[before.length - 1] ?? ""
    const count = COUNTS[last] ?? (Number.isFinite(Number(last)) && last !== "" ? Number(last) : 1)
    return { kind, count }
  }
  return null
}

/** Grams for a hand portion, or null when the coach's conversion is by volume. */
export function handPortionGrams(
  portion: { kind: HandKind; count: number },
  foodName: string,
  conversions: HandPortions
): number | null {
  switch (portion.kind) {
    case "palm":
      return conversions.palm.grams * portion.count
    case "cupped_hand":
      return conversions.cupped_hand.grams * portion.count
    case "thumb": {
      const nutButter = /\b(peanut|almond|cashew|nut|sunflower)\b.*\bbutter\b/i.test(foodName)
      return (nutButter ? conversions.thumb.nut_butter_grams : conversions.thumb.grams) * portion.count
    }
    default:
      return null
  }
}
