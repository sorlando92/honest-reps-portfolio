// Ranks food database candidates for one parsed item. USDA's own search
// ranking favors partial matches ("breaded tenders" for "chicken breast"), so
// candidates are re-scored here. Pure functions; tuned against evals/.

import type { FoodState } from "@/lib/ai/p1"

export interface Candidate {
  id: string
  description: string
  dataType: string
  brand: string | null
}

export interface ScoredCandidate<C extends Candidate> {
  candidate: C
  /** 0 to 1. Below the app_config match threshold the item is flagged. */
  score: number
  state: FoodState | null
}

// Words that describe cooking state, read separately from name tokens.
const COOKED = /\b(cooked|roasted|grilled|broiled|baked|boiled|steamed|fried|braised|stewed|sauteed|toasted|prepared|ns as to cooking method)\b/
const RAW = /\b(raw|uncooked)\b/
const DRY = /\b(dry|dried|uncooked)\b/

// Words that carry no identity: filler in USDA descriptions and P1 names.
const NEUTRAL = new Set([
  "a", "and", "as", "or", "of", "the", "with", "without", "to", "ns", "nfs", "method", "cooking", "type",
  "plain", "regular", "whole", "meat", "only", "eaten", "not", "made", "from", "includes", "prepared",
  "cooked", "raw", "uncooked", "dry", "1", "slice", "piece", "serving",
])

// Foods whose calories change a lot between raw, cooked and dry (PRD F2).
const STATEFUL = /\b(chicken|beef|pork|turkey|lamb|steak|veal|bison|venison|ground|patty|sausage|bacon|ham|salmon|tuna|cod|tilapia|shrimp|fish|halibut|trout|rice|pasta|penne|spaghetti|macaroni|noodles?|quinoa|couscous|barley|oats|oatmeal|farro|lentils?|beans?|chickpeas?)\b/
const DRY_CAPABLE = /\b(rice|pasta|penne|spaghetti|macaroni|noodles?|quinoa|couscous|barley|oats|oatmeal|farro|lentils?)\b/

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9% ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
}

function isStateful(name: string): boolean {
  return STATEFUL.test(name.toLowerCase())
}

/** The state a candidate's description names, if any. */
export function describedState(description: string, name: string): FoodState | null {
  const d = description.toLowerCase()
  if (DRY_CAPABLE.test(name.toLowerCase()) && DRY.test(d)) return "dry"
  if (RAW.test(d)) return "raw"
  if (COOKED.test(d)) return "cooked"
  return null
}

/**
 * The state to match: what the user said, else cooked for foods whose
 * calories depend on it (AI_PROMPTS.md P1 post-processing), else none.
 */
export function wantedState(name: string, stated: FoodState | null): FoodState | null {
  if (stated) return stated
  return isStateful(name) ? "cooked" : null
}

/**
 * Ranks a chain's own menu items. Menu names are short and leave out what
 * the chain implies ("Nuggets" at Chick-fil-A is chicken), so the score is
 * how much of the menu name the user's words cover, minus a little for each
 * of the user's words the menu name lacks. The quantity counts as a word, so
 * "8 count nuggets" prefers "8 ct Nuggets".
 *
 * Size and style words ("large hand tossed") are not the food: they are not
 * required, but they pick between sizes. They count when said anywhere in the
 * meal text, since the parsed name often drops them ("2 slices of large
 * pepperoni pizza" comes back as "pepperoni pizza").
 */
export function rankMenu<C extends { name: string }>(
  item: { name: string; quantity: number },
  menu: C[],
  mealText = ""
): { item: C; score: number }[] {
  const said = new Set([...tokens(item.name), String(item.quantity)].filter((t) => !MENU_NEUTRAL.has(t)))
  const sizes = new Set([...said, ...tokens(mealText)].filter((t) => MENU_SIZE.has(t)))
  return menu
    .map((m) => {
      const all = tokens(m.name).filter((t) => !MENU_NEUTRAL.has(t))
      const words = all.filter((t) => !MENU_SIZE.has(t))
      if (!words.length) return { item: m, score: 0 }
      const covered = words.filter((t) => said.has(t) || (SYNONYMS[t] ?? []).some((s) => said.has(s))).length
      const unsaid = [...said].filter((t) => !all.includes(t) && !/^\d+$/.test(t) && !MENU_SIZE.has(t)).length
      // A matching count ("12 ct") beats the same item without one.
      const countBonus = all.some((t) => /^\d+$/.test(t) && said.has(t)) ? 0.05 : 0
      const sizeWords = all.filter((t) => MENU_SIZE.has(t))
      const sizeScore = 0.05 * sizeWords.filter((t) => sizes.has(t)).length - 0.15 * sizeWords.filter((t) => SIZE_NAMES.has(t) && !sizes.has(t) && [...sizes].some((s) => SIZE_NAMES.has(s))).length
      return { item: m, score: Math.max(0, Math.min(1, covered / words.length - 0.1 * unsaid + countBonus + sizeScore)) }
    })
    .sort((a, b) => b.score - a.score)
}

// Sizes, and crust and style words, in menu names.
const SIZE_NAMES = new Set(["small", "medium", "large", "regular", "kid", "kids", "mini"])
const MENU_SIZE = new Set([...SIZE_NAMES, "hand", "tossed", "thin", "crust", "inch", "footlong", "half", "whole", "cup", "bowl"])

// Serving words in menu names ("1 slice", "8 ct") that say nothing about the food.
const MENU_NEUTRAL = new Set(["1", "ct", "count", "slice", "piece", "serving", "w", "with", "the", "a", "of", "and", "order"])

// Preparations that change calories a lot, or unusual variants. Unless the
// user said them, a candidate carrying one is a worse match than a plain one.
const OFF_TARGET = new Set([
  "breaded", "battered", "fried", "glutinous", "clarified", "ghee", "babyfood", "infant", "dehydrated",
  "imitation", "dried", "condensed", "concentrate", "powder", "mix", "soup", "frosted", "candied", "sweetened",
])

const SKIN_ON = /\b(skin eaten|meat and skin|with skin)\b/

// USDA category prefixes ("Fish, salmon", "Nuts, almonds", "Cereals, oats"):
// a heading, not a different food.
const CATEGORY_HEADS = new Set([
  "fish", "cereal", "beverage", "nut", "seed", "spice", "crustacean", "mollusk", "snack", "alcoholic",
  "beef", "pork", "lamb", "veal", "chicken", "turkey", "oil", "vegetable", "fruit", "dairy",
])

// Everyday names that USDA spells differently. Grow this from eval failures.
const SYNONYMS: Record<string, string[]> = {
  oatmeal: ["oat"],
  toast: ["toasted", "bread"],
  count: ["ct"],
  coke: ["cola"],
  soda: ["carbonated"],
}

export function rank<C extends Candidate>(
  item: { name: string; brand: string | null; state: FoodState | null },
  candidates: C[]
): ScoredCandidate<C>[] {
  const want = wantedState(item.name, item.state)
  const query = new Set(tokens(item.name).filter((t) => !NEUTRAL.has(t)))
  // Synonyms count as words the user said, so they are never "extra".
  const said = new Set([...query, ...[...query].flatMap((t) => SYNONYMS[t] ?? [])])
  const brandTokens = item.brand ? tokens(item.brand) : []

  return candidates
    .map((candidate) => {
      const desc = tokens(candidate.description)
      const descSet = new Set(desc)
      const hits = [...query].filter((t) => descSet.has(t) || (SYNONYMS[t] ?? []).some((s) => descSet.has(s))).length
      const coverage = query.size ? hits / query.size : 0
      const extra = (t: string) => !said.has(t) && !NEUTRAL.has(t)
      const extras = new Set(desc.filter(extra))
      // USDA names lead with the food ("Bagels, egg", "Rice noodles, cooked"):
      // words there that the user did not say mean a different food.
      // Branded names have no commas ("CORE POWER ... PROTEIN SHAKE"), so there
      // is no leading food to read; the rule only fits USDA's generic names.
      const lead = candidate.description.includes(",") ? candidate.description.split(",")[0] : ""
      const head = new Set(tokens(lead).filter((t) => extra(t) && !CATEGORY_HEADS.has(t)))
      // Skin on adds a lot of fat; only match it when the user said skin.
      const skinOn = !said.has("skin") && SKIN_ON.test(candidate.description.toLowerCase())
      const offTarget = [...extras].filter((t) => OFF_TARGET.has(t)).length + (skinOn ? 1 : 0)
      const state = describedState(candidate.description, item.name)

      let raw = coverage - 0.04 * extras.size - 0.2 * head.size - 0.3 * offTarget
      if (want && state === want) raw += 0.1
      if (want && state && state !== want) raw -= 0.5
      if (want && !state) raw -= 0.1
      if (candidate.dataType === "Foundation" || candidate.dataType === "SR Legacy") raw += 0.03
      // The user named the brand: that brand's product beats a generic one.
      if (brandTokens.length) {
        const owner = tokens(`${candidate.brand ?? ""} ${candidate.description}`)
        if (brandTokens.every((t) => owner.includes(t))) raw += 0.4
      }
      return { candidate, raw, state }
    })
    // Sort on the unclipped score so near ties do not fall back to USDA's order.
    .sort((a, b) => b.raw - a.raw)
    .map(({ candidate, raw, state }) => ({ candidate, score: Math.max(0, Math.min(1, raw)), state }))
}

/**
 * Text safe to send to FDC search. FDC answers any query containing a slash
 * with a 400, so a lean ratio ("93/7") becomes USDA's own wording ("93% lean")
 * and other slashes become spaces. Restaurant names in parentheses go.
 */
export function searchText(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/(\d{2})\s*\/\s*\d{1,2}\b/g, "$1% lean")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The Raw / Cooked / Dry choices for a food (PRD F2): meat, fish, grains and
 * pasta get Raw and Cooked, grains and pasta also Dry. Null for other foods.
 */
export function stateOptions(name: string): FoodState[] | null {
  const n = name.toLowerCase()
  if (!STATEFUL.test(n)) return null
  return DRY_CAPABLE.test(n) ? ["raw", "cooked", "dry"] : ["raw", "cooked"]
}
