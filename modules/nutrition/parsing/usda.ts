import "server-only"
import { searchFdcLocal } from "./fdc-local.ts"

// USDA FoodData Central search (ARCHITECTURE.md "Food data").
const SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

/** Counts for the eval: a run with any failed search is not a clean run. */
export const usdaStats = { calls: 0, cacheHits: 0, failures: 0, failed: [] as string[] }

export interface Per100g {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface UsdaFood {
  fdcId: number
  description: string
  dataType: string
  brand: string | null
  per100g: Per100g
  /** FNDDS results only: the first common portion from the search response. */
  portion?: Portion
}

/** A common household portion, for example "1 medium" at 118 g. */
export interface Portion {
  label: string
  grams: number
}

interface SearchResponse {
  foods?: {
    fdcId: number
    description: string
    dataType: string
    brandName?: string
    brandOwner?: string
    foodNutrients?: { nutrientNumber?: string; unitName?: string; value?: number }[]
    foodMeasures?: { disseminationText?: string; gramWeight?: number; rank?: number }[]
  }[]
}

/**
 * Searches generic foods, or branded foods when a brand is given.
 *
 * FDC's dataType filter is unreliable (measured 2026-10-13): a multi-value
 * filter, or "Survey (FNDDS)" alone, gets a bare nginx 400 on most requests,
 * however it is encoded. "Foundation", "SR Legacy" and "Branded" alone are
 * reliable, and so is an unfiltered search. Unfiltered results can be all
 * branded ("marinara sauce"), so generic foods come from three parallel
 * searches: Foundation, SR Legacy, and unfiltered keeping only FNDDS.
 */
export async function searchUsda(query: string, opts: { branded?: boolean; pageSize?: number } = {}): Promise<UsdaFood[]> {
  const size = opts.pageSize ?? 25
  if (opts.branded) return searchOnce(query, "Branded", size)
  // QUESTIONS.md Q40: generic foods come from our own copy. FDC_SEARCH=api
  // uses the FDC API instead, for comparing the two in the eval.
  if (process.env.FDC_SEARCH !== "api") return searchFdcLocal(query)
  const pages = await Promise.all([
    searchOnce(query, "Foundation", size),
    searchOnce(query, "SR Legacy", size),
    searchOnce(query, null, 50, "Survey (FNDDS)"),
  ])
  return pages.flat()
}

async function searchOnce(query: string, dataType: string | null, pageSize: number, keep?: string): Promise<UsdaFood[]> {
  const key = process.env.USDA_API_KEY
  if (!key) throw new Error("Missing environment variable USDA_API_KEY. See .env.example.")
  const params = new URLSearchParams({ query, pageSize: String(pageSize), api_key: key })
  if (dataType) params.set("dataType", dataType)
  const body = await cached(params, async () => (await fetchWithRetry(`${SEARCH_URL}?${params}`).then((r) => r.json())) as SearchResponse)

  return (body.foods ?? []).flatMap((f) => {
    if (keep && f.dataType !== keep) return []
    const per100g = nutrients(f.foodNutrients ?? [])
    if (!per100g) return []
    const portion = measurePortion(f.foodMeasures ?? [])
    return [{ fdcId: f.fdcId, description: f.description, dataType: f.dataType, brand: f.brandName || f.brandOwner || null, per100g, ...(portion ? { portion } : {}) }]
  })
}

/**
 * Eval only: with USDA_CACHE_DIR set, responses are kept on disk so repeated
 * eval runs are repeatable and do not spend the key's 3,600 requests an hour.
 * The app never sets it.
 */
async function cached(params: URLSearchParams, load: () => Promise<SearchResponse>): Promise<SearchResponse> {
  const dir = process.env.USDA_CACHE_DIR
  if (!dir) return load()
  const { createHash } = await import("node:crypto")
  const { mkdir, readFile, writeFile } = await import("node:fs/promises")
  const keyless = new URLSearchParams(params)
  keyless.delete("api_key")
  const file = `${dir}/${createHash("sha1").update(keyless.toString()).digest("hex")}.json`
  try {
    const hit = JSON.parse(await readFile(file, "utf8")) as SearchResponse
    usdaStats.cacheHits++
    return hit
  } catch {
    const body = await load()
    await mkdir(dir, { recursive: true })
    await writeFile(file, JSON.stringify(body))
    return body
  }
}

// Retry the stray 400, rate limits and server errors; give up after 3 tries
// so logging never hangs. (FDC's POST search is far slower, so GET it is.)
const ATTEMPTS = 3
const TIMEOUT_MS = 8000

async function fetchWithRetry(url: string): Promise<Response> {
  usdaStats.calls++
  let last = ""
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.ok) return res
      last = `${res.status}`
      if (res.status !== 400 && res.status !== 429 && res.status < 500) break
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 250 * attempt))
  }
  usdaStats.failures++
  const keyless = new URL(url)
  keyless.searchParams.delete("api_key")
  usdaStats.failed.push(`${last} ${keyless.search}`)
  throw new Error(`USDA search failed: ${last}`)
}

// Search results report nutrients per 100 g. Energy is 208 (kcal) for most
// foods; some Foundation foods only carry the Atwater values 958 and 957.
function nutrients(list: { nutrientNumber?: string; unitName?: string; value?: number }[]): Per100g | null {
  const value = (number: string) => list.find((n) => n.nutrientNumber === number && typeof n.value === "number")?.value
  const kcal = value("208") ?? value("958") ?? value("957")
  if (kcal === undefined) return null
  return { kcal, protein_g: value("203") ?? 0, carbs_g: value("205") ?? 0, fat_g: value("204") ?? 0 }
}

// FNDDS measures carry a rank; 1 is the most common household portion.
// "Quantity not specified" is a survey default, not a portion anyone names.
export function measurePortion(measures: { disseminationText?: string; gramWeight?: number; rank?: number }[]): Portion | null {
  const usable = measures
    .filter((m) => m.disseminationText && m.gramWeight && m.gramWeight > 0 && !/quantity not specified/i.test(m.disseminationText))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  const m = usable[0]
  return m ? { label: m.disseminationText!, grams: m.gramWeight! } : null
}

export interface DetailPortion {
  amount?: number
  modifier?: string | null
  portionDescription?: string | null
  measureUnit?: { name?: string } | null
  gramWeight?: number
  sequenceNumber?: number
}

/**
 * The first common portion of an SR Legacy or Foundation food, from the food
 * detail endpoint (search results do not include them). Lowest sequence
 * number first; labels drop USDA's size notes in parentheses.
 */
export function detailPortion(portions: DetailPortion[]): Portion | null {
  return orderedPortions(portions)[0] ?? null
}

/** All usable portions, most common first (also used by the local FDC import). */
export function orderedPortions(portions: DetailPortion[]): Portion[] {
  return portions
    .filter((p) => p.gramWeight && p.gramWeight > 0)
    .map((p, index) => ({ p, index, label: portionLabel(p) }))
    .filter((x) => x.label && !/\b(racc|nlea serving|quantity not specified)\b/i.test(x.label))
    .sort((a, b) => (a.p.sequenceNumber ?? 999) - (b.p.sequenceNumber ?? 999) || a.index - b.index)
    .map((x) => ({ label: x.label, grams: x.p.gramWeight! }))
}

function portionLabel(p: DetailPortion): string {
  if (p.portionDescription && !/quantity not specified/i.test(p.portionDescription)) return clean(p.portionDescription)
  const unit = p.measureUnit?.name && p.measureUnit.name !== "undetermined" ? p.measureUnit.name : ""
  return clean([p.amount ?? 1, unit, p.modifier ?? ""].join(" "))
}

const clean = (s: string) => s.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()

