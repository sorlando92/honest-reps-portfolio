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
  "cooked", "raw", "uncooked", "dry",
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

export function isStateful(name: string): boolean {
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

// Preparations that change calories a lot, or unusual variants. Unless the
// user said them, a candidate carrying one is a worse match than a plain one.
const OFF_TARGET = new Set([
  "breaded", "battered", "fried", "glutinous", "clarified", "ghee", "babyfood", "infant", "dehydrated",
  "imitation", "dried", "condensed", "concentrate", "powder", "mix", "soup", "frosted", "candied", "sweetened",
])

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
      const head = new Set(tokens(candidate.description.split(",")[0]).filter((t) => extra(t) && !CATEGORY_HEADS.has(t)))
      const offTarget = [...extras].filter((t) => OFF_TARGET.has(t)).length
      const state = describedState(candidate.description, item.name)

      let raw = coverage - 0.04 * extras.size - 0.2 * head.size - 0.3 * offTarget
      if (want && state === want) raw += 0.1
      if (want && state && state !== want) raw -= 0.5
      if (want && !state) raw -= 0.1
      if (candidate.dataType === "Foundation" || candidate.dataType === "SR Legacy") raw += 0.03
      if (brandTokens.length) {
        const owner = tokens(`${candidate.brand ?? ""} ${candidate.description}`)
        if (brandTokens.every((t) => owner.includes(t))) raw += 0.2
      }
      return { candidate, raw, state }
    })
    // Sort on the unclipped score so near ties do not fall back to USDA's order.
    .sort((a, b) => b.raw - a.raw)
    .map(({ candidate, raw, state }) => ({ candidate, score: Math.max(0, Math.min(1, raw)), state }))
}
