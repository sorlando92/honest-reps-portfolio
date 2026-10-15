import "server-only"
// Relative imports with extensions so `pnpm eval:parsing` can run this file
// directly in Node, which does not know the @/ alias.
import { runP1, type AmountSource, type FoodState, type P1Item } from "../../../lib/ai/p1.ts"
import type { AiCallRecord } from "../../../lib/ai/client.ts"
import { curatedSourceId, findCuratedChain, isUncuratedChain, type ChainData } from "../data/chains/index.ts"
import { DEFAULT_HAND_PORTIONS, handPortionFor, handPortionGrams, type HandPortions } from "./hand.ts"
import { rank, rankMenu, searchText, wantedState } from "./match.ts"
import { searchUsda, type Per100g, type UsdaFood } from "./usda.ts"

// QUESTIONS.md Q11: starts at 0.5, tuned against the parsing eval. Read from
// app_config by callers that have a database; the eval uses this default.
export const DEFAULT_MATCH_THRESHOLD = 0.5
// AI_PROMPTS.md P1: flag when capped confidence is under 0.7.
const CONFIDENCE_FLAG = 0.7
// Amount source caps (AI_PROMPTS.md P1), for amounts this code re-labels.
const ESTIMATED_CAP = 0.6

/**
 * A published serving (chain menus, product labels) or a common portion
 * (USDA "1 medium"). Label items step in these servings on the card (PRD F2).
 */
export interface Serving {
  label: string
  grams: number | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface MatchedFood {
  source: "usda" | "custom"
  sourceId: string
  name: string
  brand: string | null
  dataType: string
  state: FoodState | null
  per100g: Per100g
  /** Curated chain items: the published serving. */
  serving?: Serving
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
  /** Saved entries count flagged items; the reason decides what the card shows (Q34). */
  flagged: boolean
  /** "match": food uncertain, show "Check this". "amount": amount estimated, show "Estimated". */
  flagReason: "match" | "amount" | null
  alternatives: MatchedFood[]
  /**
   * Label items with a known serving: the card steps in servings, quantity is
   * the number of servings and unit is "serving".
   */
  serving?: Serving
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
  /** The coach's conversions from nutrition_coach_settings. */
  handPortions?: HandPortions
  /** Overrides ANTHROPIC_MODEL; the eval uses it to compare models. */
  model?: string
}

export async function parseMeal(text: string, opts: ParseOptions): Promise<ParseResult> {
  const p1 = await runP1(text, { units: opts.units, localTime: opts.localTime, model: opts.model })
  if (!p1.output) {
    return { items: [], unparsedText: text, modelOutput: null, aiCall: p1.record, fallback: true }
  }
  const ctx: MatchContext = {
    text,
    threshold: opts.matchThreshold ?? DEFAULT_MATCH_THRESHOLD,
    hand: opts.handPortions ?? DEFAULT_HAND_PORTIONS,
  }
  const items = await Promise.all(p1.output.items.map((item) => matchItem(withHandGrams(item, ctx), ctx)))
  return { items, unparsedText: p1.output.unparsed_text, modelOutput: p1.output, aiCall: p1.record, fallback: false }
}

interface MatchContext {
  text: string
  threshold: number
  hand: HandPortions
}

/** Hand portions take their grams from the coach's conversions (Q33). */
function withHandGrams(item: P1Item, ctx: MatchContext): P1Item {
  if (item.amount_source !== "hand") return item
  const portion = handPortionFor(ctx.text, item.name)
  const grams = portion ? handPortionGrams(portion, item.name, ctx.hand) : null
  return grams ? { ...item, grams } : item
}

async function matchItem(item: P1Item, ctx: MatchContext): Promise<ParsedItem> {
  const chain = findCuratedChain(item.brand)
  if (chain) {
    const curated = matchCurated(item, chain, ctx)
    if (curated) return curated
  }
  // PRD F2: a chain without curated data (or an item it lacks) gets a generic
  // match, marked estimated and flagged.
  const uncovered = chain !== null || isUncuratedChain(item.brand)
  const generic = await matchUsda(uncovered ? { ...item, brand: null } : item, ctx)
  if (!uncovered) return generic
  return { ...generic, brand: item.brand, amountSource: "estimated", confidence: Math.min(generic.confidence, ESTIMATED_CAP), ...flags(ESTIMATED_CAP, "estimated", generic.matchScore, ctx) }
}

function matchCurated(item: P1Item, chain: ChainData, ctx: MatchContext): ParsedItem | null {
  // Drop the chain's own name ("Medium Chick-fil-A Waffle Potato Fries") but
  // keep the commas: the ranker reads the leading food from them.
  const names = [chain.chain, ...chain.aliases].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(names.map((n) => n.replace(/[^a-z0-9]/gi, (c) => (c === " " ? "\\s*" : `\\${c}?`))).join("|"), "gi")
  const strip = (s: string) => s.replace(pattern, " ").replace(/\s+/g, " ").trim()
  const menu = chain.items.map((ci) => ({ name: strip(ci.name), ci }))
  const ranked = rankMenu({ name: strip(item.name), quantity: item.quantity }, menu, ctx.text)
  const best = ranked[0]
  if (!best || best.score < ctx.threshold) return null

  const toMatched = (r: (typeof ranked)[number]): MatchedFood => ({
    source: "custom",
    sourceId: curatedSourceId(chain, r.item.ci),
    name: r.item.ci.name,
    brand: chain.chain,
    dataType: "Curated",
    state: null,
    per100g: per100(r.item.ci, item.grams),
    serving: servingOf(r.item.ci),
  })
  const ci = best.item.ci
  // Whole servings: "double chicken" or "2 slices" is the serving times two.
  // A serving published without a weight is counted from P1's quantity, and
  // the grams stay P1's estimate (the nutrition still comes from the chain).
  const servings = ci.serving_grams
    ? Math.max(1, Math.round(item.grams / ci.serving_grams))
    : WEIGHT_UNITS.has(item.unit) ? 1 : Math.max(1, Math.round(item.quantity))
  const confidence = Math.max(item.confidence, 0.9)
  return {
    name: item.name,
    brand: chain.chain,
    quantity: servings,
    unit: "serving",
    serving: servingOf(ci),
    grams: ci.serving_grams ? round(ci.serving_grams * servings, 1) : item.grams,
    amountSource: "label",
    state: null,
    confidence,
    match: toMatched(best),
    matchScore: best.score,
    calories: round(ci.kcal * servings),
    proteinG: round(ci.protein_g * servings, 1),
    carbsG: round(ci.carbs_g * servings, 1),
    fatG: round(ci.fat_g * servings, 1),
    ...flags(confidence, "label", best.score, ctx),
    alternatives: ranked.slice(1, 4).map(toMatched),
  }
}

async function matchUsda(item: P1Item, ctx: MatchContext): Promise<ParsedItem> {
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
  const factor = item.grams / 100
  const per = match?.per100g
  const flagInfo = flags(item.confidence, item.amount_source, matchScore, ctx)

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
    ...flagInfo,
    alternatives: flagInfo.flagged ? ranked.slice(1, 4).map(toMatched) : [],
  }
}

/**
 * QUESTIONS.md Q34: one signal per row, by cause. An uncertain food match
 * wins over an estimated amount. Hand portions are never flagged for their
 * amount (PRD F2).
 */
function flags(
  confidence: number,
  source: AmountSource,
  matchScore: number,
  ctx: MatchContext
): Pick<ParsedItem, "flagged" | "flagReason"> {
  if (matchScore < ctx.threshold) return { flagged: true, flagReason: "match" }
  if (source !== "hand" && confidence < CONFIDENCE_FLAG) return { flagged: true, flagReason: "amount" }
  return { flagged: false, flagReason: null }
}

const WEIGHT_UNITS = new Set(["g", "oz", "lb", "ml", "fl_oz", "cup"])

function servingOf(ci: { serving_label?: string; serving_grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number }): Serving {
  return { label: ci.serving_label ?? "1 serving", grams: ci.serving_grams, kcal: ci.kcal, protein_g: ci.protein_g, carbs_g: ci.carbs_g, fat_g: ci.fat_g }
}

/** Per 100 g of a curated item; a serving without a weight uses the estimated grams. */
function per100(ci: { serving_grams: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number }, estimatedGrams: number): Per100g {
  const f = 100 / (ci.serving_grams ?? Math.max(estimatedGrams, 1))
  return { kcal: round(ci.kcal * f, 1), protein_g: round(ci.protein_g * f, 2), carbs_g: round(ci.carbs_g * f, 2), fat_g: round(ci.fat_g * f, 2) }
}

/** P1's name made safe for FDC search, plus the stated state. */
function searchQuery(item: P1Item): string {
  const name = searchText(item.name)
  return item.state && !name.toLowerCase().includes(item.state) ? `${name} ${item.state}` : name
}

function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
