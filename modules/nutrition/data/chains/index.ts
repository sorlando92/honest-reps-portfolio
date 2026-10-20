// Curated chain restaurant items (QUESTIONS.md Q36). One JSON file per chain,
// built from the chain's own published nutrition page or PDF; `pnpm db:seed`
// copies them into food_items. Add a chain by adding its file here.

import chickFilA from "./chick-fil-a.json" with { type: "json" }
import chipotle from "./chipotle.json" with { type: "json" }
import culvers from "./culvers.json" with { type: "json" }
import dominos from "./dominos.json" with { type: "json" }
import panera from "./panera.json" with { type: "json" }
import subway from "./subway.json" with { type: "json" }

export interface ChainItem {
  name: string
  /** Null when the chain publishes the serving without a weight (Panera, for example). */
  serving_grams: number | null
  /** The published serving, when it is not a weight ("1 Bagel", "1/2 Sandwich"). */
  serving_label?: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  note?: string
}

export interface ChainData {
  chain: string
  aliases: string[]
  source_url: string
  verified_on: string
  items: ChainItem[]
}

export const CURATED_CHAINS: ChainData[] = [chickFilA, chipotle, culvers, dominos, panera, subway]

// PRD F2: well-known chains without curated data yet. Their items get a
// generic match, marked estimated and flagged.
const UNCURATED_CHAINS = [
  "mcdonalds", "starbucks", "taco bell", "raising canes", "imos",
  "wendys", "burger king", "five guys", "chilis", "olive garden", "panda express", "jimmy johns", "jersey mikes",
  "wingstop", "sonic", "arbys", "kfc", "popeyes", "dunkin", "pizza hut", "papa johns", "little caesars", "qdoba",
  "sweetgreen", "cava", "in n out", "shake shack", "whataburger", "applebees", "buffalo wild wings", "zaxbys",
  "dairy queen", "jack in the box", "del taco", "firehouse subs", "potbelly", "tropical smoothie", "smoothie king",
  "dutch bros", "tim hortons", "krispy kreme", "texas roadhouse", "outback", "red robin", "ihop", "dennys",
  "waffle house", "crumbl", "freddys", "steak n shake", "white castle", "noodles and company",
]

function normalizeBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/['’]s\b/g, "s")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** food_items.source_id of a curated item; the seed and the parser both use it. */
export function curatedSourceId(chain: ChainData, item: ChainItem): string {
  return `${normalizeBrand(chain.chain).replace(/ /g, "-")}:${item.name}`
}

export function findCuratedChain(brand: string | null): ChainData | null {
  if (!brand) return null
  const b = normalizeBrand(brand)
  return CURATED_CHAINS.find((c) => c.aliases.some((a) => normalizeBrand(a) === b)) ?? null
}

export function isUncuratedChain(brand: string | null): boolean {
  if (!brand) return false
  const b = normalizeBrand(brand)
  return UNCURATED_CHAINS.some((c) => b === c || b.startsWith(`${c} `))
}
