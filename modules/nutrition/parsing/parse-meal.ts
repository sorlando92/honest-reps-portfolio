import "server-only"
// Relative imports with extensions so `pnpm eval:parsing` can run this file
// directly in Node, which does not know the @/ alias.
import { runP1, type AmountSource, type FoodState, type P1Item } from "../../../lib/ai/p1.ts"
import type { AiCallRecord } from "../../../lib/ai/client.ts"
import { rank, wantedState } from "./match.ts"
import { searchUsda, type Per100g, type UsdaFood } from "./usda.ts"

// QUESTIONS.md Q11: starts at 0.5, tuned against the parsing eval. Read from
// app_config by callers that have a database; the eval uses this default.
export const DEFAULT_MATCH_THRESHOLD = 0.5
// AI_PROMPTS.md P1: flag when capped confidence is under 0.7.
const CONFIDENCE_FLAG = 0.7

export interface MatchedFood {
  source: "usda"
  sourceId: string
  name: string
  brand: string | null
  dataType: string
  state: FoodState | null
  per100g: Per100g
}

export interface ParsedItem {
  /** P1's name, before matching. */
  name: string
  brand: string | null
  quantity: number
  unit: string
  grams: number
  amountSource: AmountSource
  state: FoodState | null
  confidence: number
  match: MatchedFood | null
  matchScore: number
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  flagged: boolean
  alternatives: MatchedFood[]
}

export interface ParseResult {
  items: ParsedItem[]
  unparsedText: string
  /** P1's raw validated output, stored with the entry (CLAUDE.md rule 3). */
  modelOutput: unknown
  aiCall: AiCallRecord
  /** True when P1 failed twice: show manual search prefilled with the text. */
  fallback: boolean
}

export interface ParseOptions {
  units: "imperial" | "metric"
  localTime: string
  matchThreshold?: number
}

export async function parseMeal(text: string, opts: ParseOptions): Promise<ParseResult> {
  const p1 = await runP1(text, { units: opts.units, localTime: opts.localTime })
  if (!p1.output) {
    return { items: [], unparsedText: text, modelOutput: null, aiCall: p1.record, fallback: true }
  }
  const threshold = opts.matchThreshold ?? DEFAULT_MATCH_THRESHOLD
  const items = await Promise.all(p1.output.items.map((item) => matchItem(item, threshold)))
  return { items, unparsedText: p1.output.unparsed_text, modelOutput: p1.output, aiCall: p1.record, fallback: false }
}

async function matchItem(item: P1Item, threshold: number): Promise<ParsedItem> {
  const query = searchQuery(item)
  const [generic, branded] = await Promise.all([
    searchUsda(query).catch(() => [] as UsdaFood[]),
    item.brand ? searchUsda(`${item.brand} ${query}`, { branded: true, pageSize: 10 }).catch(() => [] as UsdaFood[]) : [],
  ])
  const candidates = [...branded, ...generic].map((f) => ({ ...f, id: String(f.fdcId) }))
  const ranked = rank({ name: item.name, brand: item.brand, state: item.state }, candidates)
  const toMatched = (r: (typeof ranked)[number]): MatchedFood => ({
    source: "usda",
    sourceId: r.candidate.id,
    name: r.candidate.description,
    brand: r.candidate.brand,
    dataType: r.candidate.dataType,
    state: r.state,
    per100g: r.candidate.per100g,
  })

  const best = ranked[0]
  const match = best ? toMatched(best) : null
  const matchScore = best?.score ?? 0
  // PRD F2: hand portions are tagged, never flagged for their amount.
  const unsureAmount = item.amount_source !== "hand" && item.confidence < CONFIDENCE_FLAG
  const flagged = unsureAmount || matchScore < threshold
  const factor = item.grams / 100
  const per = match?.per100g

  return {
    name: item.name,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    grams: item.grams,
    amountSource: item.amount_source,
    // The state the entry is logged as: matched, else what the toggle defaults to.
    state: best?.state ?? wantedState(item.name, item.state),
    confidence: item.confidence,
    match,
    matchScore,
    calories: per ? round(per.kcal * factor) : 0,
    proteinG: per ? round(per.protein_g * factor, 1) : 0,
    carbsG: per ? round(per.carbs_g * factor, 1) : 0,
    fatG: per ? round(per.fat_g * factor, 1) : 0,
    flagged,
    alternatives: flagged ? ranked.slice(1, 4).map(toMatched) : [],
  }
}

/** P1's name without the restaurant in parentheses, plus the stated state. */
function searchQuery(item: P1Item): string {
  const name = item.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
  return item.state && !name.toLowerCase().includes(item.state) ? `${name} ${item.state}` : name
}

function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
