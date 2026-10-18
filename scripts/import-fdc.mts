// Loads USDA FoodData Central Foundation, SR Legacy and FNDDS into
// public.fdc_foods (QUESTIONS.md Q40) and Branded Foods into
// public.fdc_branded (docs/FOOD_LOOKUP_SPEC.md 2), then rebuilds the typo
// word list. Safe to rerun and meant to be rerun monthly: generic rows are
// upserted by fdc_id, branded rows by GTIN, and branded products missing
// from the new release are removed. Download and unzip the CSV releases
// first, into one folder (any subset; the missing ones are skipped):
//
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2026-04-30.zip
//
// Each dataset run is recorded in public.fdc_import_runs with rows added,
// changed and removed (PM 2026-10-17); scripts/fdc-refresh.mts runs this
// monthly from GitHub Actions with --trigger schedule.
//
//   pnpm db:import-fdc --dir <folder>                      local (.env.local)
//   node --conditions=react-server --env-file=.env.hosted scripts/import-fdc.mts --dir <folder>   hosted
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { appendFileSync, createReadStream, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { createClient } from "@supabase/supabase-js"
import { padGtin } from "../modules/nutrition/foods/gtin.ts"
import { orderedPortions, type DetailPortion } from "../modules/nutrition/parsing/usda.ts"

const DATASETS = [
  { prefix: "FoodData_Central_foundation_food_csv_", ids: "foundation_food.csv", dataType: "Foundation", name: "Foundation" },
  { prefix: "FoodData_Central_sr_legacy_food_csv_", ids: "sr_legacy_food.csv", dataType: "SR Legacy", name: "SR Legacy" },
  { prefix: "FoodData_Central_survey_food_csv_", ids: "survey_fndds_food.csv", dataType: "Survey (FNDDS)", name: "FNDDS" },
] as const

// FDC nutrient ids: energy in kcal (1008), else the Atwater energies the
// search API falls back to (2048 specific, 2047 general); protein, carbs, fat.
// The FNDDS release stores nutrient numbers instead (208, 203, 205, 204); no
// FDC id uses those values, so both are accepted.
const NUTRIENTS = { kcal: ["1008", "208", "2048", "2047"], protein_g: ["1003", "203"], carbs_g: ["1005", "205"], fat_g: ["1004", "204"] } as const
const WANTED = new Set<string>(Object.values(NUTRIENTS).flat())
const BATCH = 500

const dirArg = process.argv.indexOf("--dir")
if (dirArg < 0 || !process.argv[dirArg + 1]) throw new Error("Pass --dir <folder with the unzipped FDC CSV releases>")
const root = process.argv[dirArg + 1]
const triggerArg = process.argv.indexOf("--trigger")
const trigger = triggerArg >= 0 && process.argv[triggerArg + 1] === "schedule" ? "schedule" : "manual"
const summary: string[] = []
const url = need("NEXT_PUBLIC_SUPABASE_URL")
const admin = createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  let total = 0
  let found = 0
  for (const ds of DATASETS) {
    const dir = findDataset(root, ds.prefix)
    if (!dir) {
      console.log(`${ds.name}: no ${ds.prefix} folder, skipped`)
      continue
    }
    found++
    const release = `${ds.name} ${dir.name.slice(ds.prefix.length)}`
    const ids = new Set<string>()
    await eachRow(join(dir.path, ds.ids), (r) => ids.add(r.fdc_id))

    const description = new Map<string, string>()
    await eachRow(join(dir.path, "food.csv"), (r) => {
      if (ids.has(r.fdc_id)) description.set(r.fdc_id, r.description)
    })

    const nutrients = new Map<string, Map<string, number>>()
    await eachRow(join(dir.path, "food_nutrient.csv"), (r) => {
      if (!ids.has(r.fdc_id) || !WANTED.has(r.nutrient_id) || r.amount === "") return
      const m = nutrients.get(r.fdc_id) ?? new Map<string, number>()
      m.set(r.nutrient_id, Number(r.amount))
      nutrients.set(r.fdc_id, m)
    })

    const units = new Map<string, string>()
    await eachRow(join(dir.path, "measure_unit.csv"), (r) => units.set(r.id, r.name))
    const portions = new Map<string, DetailPortion[]>()
    await eachRow(join(dir.path, "food_portion.csv"), (r) => {
      if (!ids.has(r.fdc_id)) return
      const list = portions.get(r.fdc_id) ?? []
      list.push({
        amount: r.amount === "" ? undefined : Number(r.amount),
        modifier: r.modifier || null,
        portionDescription: r.portion_description || null,
        measureUnit: { name: units.get(r.measure_unit_id) },
        gramWeight: Number(r.gram_weight),
        sequenceNumber: r.seq_num === "" ? undefined : Number(r.seq_num),
      })
      portions.set(r.fdc_id, list)
    })

    const rows = [...ids].flatMap((id) => {
      const n = nutrients.get(id)
      const pick = (keys: readonly string[]) => keys.map((k) => n?.get(k)).find((v) => v !== undefined && Number.isFinite(v))
      const kcal = pick(NUTRIENTS.kcal)
      const name = description.get(id)
      if (kcal === undefined || !name) return []
      return [
        {
          fdc_id: Number(id),
          data_type: ds.dataType,
          description: name,
          per_100g: { kcal, protein_g: pick(NUTRIENTS.protein_g) ?? 0, carbs_g: pick(NUTRIENTS.carbs_g) ?? 0, fat_g: pick(NUTRIENTS.fat_g) ?? 0 },
          portions: orderedPortions(portions.get(id) ?? []),
          release,
        },
      ]
    })

    const before = new Map(
      (await allRows<{ fdc_id: number; description: string; per_100g: unknown; portions: unknown }>("fdc_foods", "fdc_id, description, per_100g, portions", "data_type", ds.dataType)).map((r) => [
        r.fdc_id,
        stable([r.description, r.per_100g, r.portions]),
      ])
    )
    const added = rows.filter((r) => !before.has(r.fdc_id)).length
    const changed = rows.filter((r) => before.has(r.fdc_id) && before.get(r.fdc_id) !== stable([r.description, r.per_100g, r.portions])).length
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await admin.from("fdc_foods").upsert(rows.slice(i, i + BATCH), { onConflict: "fdc_id" })
      if (error) throw new Error(`${release}: ${error.message}`)
    }
    const kept = new Set(rows.map((r) => r.fdc_id))
    const gone = [...before.keys()].filter((id) => !kept.has(id))
    for (let i = 0; i < gone.length; i += BATCH) {
      const { error } = await admin.from("fdc_foods").delete().in("fdc_id", gone.slice(i, i + BATCH))
      if (error) throw new Error(`${release}: removing old foods: ${error.message}`)
    }
    console.log(`${release}: ${rows.length} foods (${ids.size - rows.length} skipped without calories)`)
    await recordRun(ds.name, release, { added, changed, removed: gone.length, total: rows.length })
    total += rows.length
  }

  const branded = findDataset(root, BRANDED_PREFIX)
  if (branded) {
    found++
    total += await importBranded(branded)
  } else console.log(`Branded: no ${BRANDED_PREFIX} folder, skipped`)
  if (!found) throw new Error(`No FDC release folders in ${root}`)

  const { data: words, error } = await admin.rpc("refresh_food_words")
  if (error) throw new Error(`refresh_food_words: ${error.message}`)
  console.log(`Imported ${total} foods into ${new URL(url).host}; ${words} search words.`)
  writeSummary()
}

/** JSON with sorted keys, so stored jsonb and fresh rows compare equal. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))
}

/** Every row of a table matching column = value, a page at a time. */
async function allRows<T>(table: string, columns: string, column: string | null, value: string | null): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let request = admin.from(table).select(columns).order(columns.split(",")[0].trim()).range(from, from + PAGE - 1)
    if (column && value !== null) request = request.eq(column, value)
    const { data, error } = await request
    if (error) throw new Error(`Reading ${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return out
  }
}

/** One dataset's run in public.fdc_import_runs, and a line for the job summary. */
async function recordRun(dataset: string, release: string, counts: { added: number; changed: number; removed: number; total: number } | null) {
  const { error } = await admin.from("fdc_import_runs").insert({ dataset, release, imported: counts !== null, trigger, ...(counts ?? {}) })
  if (error) throw new Error(`Recording the ${dataset} run: ${error.message}`)
  summary.push(counts ? `| ${dataset} | ${release} | ${counts.added} | ${counts.changed} | ${counts.removed} | ${counts.total} |` : `| ${dataset} | ${release} | no new release | | | |`)
}

function writeSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY
  const table = ["| Dataset | Release | Added | Changed | Removed | Total |", "|---|---|---|---|---|---|", ...summary].join("\n")
  console.log(table)
  if (file) appendFileSync(file, `## FDC refresh on ${new URL(url).host}\n\n${table}\n`)
}

const BRANDED_PREFIX = "FoodData_Central_branded_food_csv_"
const BRANDED_BATCH = 1000
// Energy in kcal, else the Atwater energies; protein, carbs, fat.
const BRANDED_NUTRIENTS = { kcal: ["1008", "2048", "2047"], protein_g: ["1003"], carbs_g: ["1005"], fat_g: ["1004"] } as const
const BRANDED_WANTED = new Set<string>(Object.values(BRANDED_NUTRIENTS).flat())

interface BrandedPick {
  fdcId: string
  available: string
  brandOwner: string
  brandName: string
  servingSize: number | null
  servingUnit: "g" | "ml" | null
  household: string
  category: string
}

/** FDC writes grams and milliliters several ways; anything else has no usable serving. */
function servingUnit(unit: string): "g" | "ml" | null {
  const u = unit.trim().toLowerCase()
  if (["g", "grm", "gr", "gm"].includes(u)) return "g"
  if (["ml", "mlt"].includes(u)) return "ml"
  return null
}

/**
 * Branded Foods: one row per canonical GTIN-14, the latest available
 * version, discontinued products and products without calories left out.
 */
async function importBranded(dir: { path: string; name: string }): Promise<number> {
  const release = `Branded ${dir.name.slice(BRANDED_PREFIX.length)}`
  const byGtin = new Map<string, BrandedPick>()
  let versions = 0
  await eachRow(join(dir.path, "branded_food.csv"), (r) => {
    versions++
    const gtin = padGtin(r.gtin_upc)
    if (!gtin || r.discontinued_date) return
    const prev = byGtin.get(gtin)
    const available = r.available_date || r.modified_date || ""
    if (prev && (prev.available > available || (prev.available === available && Number(prev.fdcId) > Number(r.fdc_id)))) return
    const size = Number(r.serving_size)
    const unit = servingUnit(r.serving_size_unit)
    byGtin.set(gtin, {
      fdcId: r.fdc_id,
      available,
      brandOwner: r.brand_owner.trim(),
      brandName: r.brand_name.trim(),
      servingSize: unit && Number.isFinite(size) && size > 0 && size < 5000 ? size : null,
      servingUnit: unit && Number.isFinite(size) && size > 0 && size < 5000 ? unit : null,
      household: r.household_serving_fulltext.trim(),
      category: r.branded_food_category.trim(),
    })
  })
  const winners = new Map([...byGtin].map(([gtin, pick]) => [pick.fdcId, gtin]))
  console.log(`${release}: ${versions} versions, ${byGtin.size} current products`)

  const description = new Map<string, string>()
  await eachRow(join(dir.path, "food.csv"), (r) => {
    if (winners.has(r.fdc_id)) description.set(r.fdc_id, r.description.trim())
  })

  // food_nutrient.csv is the largest file (tens of millions of rows) and has
  // no commas inside fields, so it is split directly instead of parsed.
  const nutrients = new Map<string, Map<string, number>>()
  await eachLine(join(dir.path, "food_nutrient.csv"), (line) => {
    const f = line.slice(1, -1).split('","')
    const [, fdcId, nutrientId, amount] = f
    if (!BRANDED_WANTED.has(nutrientId) || !winners.has(fdcId) || amount === "") return
    const m = nutrients.get(fdcId) ?? new Map<string, number>()
    m.set(nutrientId, Number(amount))
    nutrients.set(fdcId, m)
  })

  const rows = [...byGtin].flatMap(([gtin, p]) => {
    const n = nutrients.get(p.fdcId)
    const pick = (keys: readonly string[]) => keys.map((k) => n?.get(k)).find((v) => v !== undefined && Number.isFinite(v) && v >= 0)
    const kcal = pick(BRANDED_NUTRIENTS.kcal)
    const name = description.get(p.fdcId)
    if (kcal === undefined || !name) return []
    // Only nutrients FDC has go in, so search can tell complete foods apart.
    const per_100g: Record<string, number> = { kcal }
    for (const key of ["protein_g", "carbs_g", "fat_g"] as const) {
      const v = pick(BRANDED_NUTRIENTS[key])
      if (v !== undefined) per_100g[key] = v
    }
    return [
      {
        fdc_id: Number(p.fdcId),
        gtin,
        description: name.slice(0, 300),
        brand_owner: p.brandOwner || null,
        brand_name: p.brandName || null,
        serving_size: p.servingSize,
        serving_unit: p.servingUnit,
        household_serving: p.household || null,
        per_100g,
        category: p.category || null,
        release,
      },
    ]
  })

  const before = new Map((await allRows<{ gtin: string; fdc_id: number }>("fdc_branded", "gtin, fdc_id", null, null)).map((r) => [r.gtin, r.fdc_id]))
  const added = rows.filter((r) => !before.has(r.gtin)).length
  // A new FDC version of a product has a new fdc_id under the same GTIN.
  const changed = rows.filter((r) => before.has(r.gtin) && before.get(r.gtin) !== r.fdc_id).length
  for (let i = 0; i < rows.length; i += BRANDED_BATCH) {
    const { error } = await admin.from("fdc_branded").upsert(rows.slice(i, i + BRANDED_BATCH), { onConflict: "gtin" })
    if (error) throw new Error(`${release}: ${error.message}`)
    if ((i / BRANDED_BATCH) % 50 === 0) console.log(`${release}: ${i + BRANDED_BATCH > rows.length ? rows.length : i + BRANDED_BATCH} of ${rows.length}`)
  }
  // Products no longer in the release (discontinued, withdrawn) go. Deleted
  // by GTIN in batches: one delete over the whole table hits the hosted
  // statement timeout.
  const current = new Set(rows.map((r) => r.gtin))
  const gone = [...before.keys()].filter((g) => !current.has(g))
  for (let i = 0; i < gone.length; i += BATCH) {
    const { error } = await admin.from("fdc_branded").delete().in("gtin", gone.slice(i, i + BATCH))
    if (error) throw new Error(`${release}: removing old products: ${error.message}`)
  }
  console.log(`${release}: ${rows.length} products (${byGtin.size - rows.length} skipped without calories, ${gone.length} old products removed)`)
  await recordRun("Branded", release, { added, changed, removed: gone.length, total: rows.length })
  return rows.length
}

/** The dataset's folder, or null; zips unpack to a folder holding a same-named folder. */
function findDataset(base: string, prefix: string): { path: string; name: string } | null {
  const outer = readdirSync(base).find((n) => n.startsWith(prefix) && statSync(join(base, n)).isDirectory())
  if (!outer) return null
  const inner = join(base, outer, outer)
  return { path: statSync(inner, { throwIfNoEntry: false })?.isDirectory() ? inner : join(base, outer), name: outer }
}

/** Calls back with every non-empty line after the header. */
async function eachLine(file: string, onLine: (line: string) => void): Promise<void> {
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity })
  let header = true
  for await (const line of lines) {
    if (header) {
      header = false
      continue
    }
    if (line) onLine(line)
  }
}

/**
 * Calls back with each CSV row as an object keyed by the header. FDC quotes
 * every field; a quoted field can hold line breaks (Branded ingredients), so
 * lines are joined until the quotes balance.
 */
async function eachRow(file: string, onRow: (row: Record<string, string>) => void): Promise<void> {
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity })
  let header: string[] | null = null
  let pending = ""
  for await (const raw of lines) {
    const line = pending ? `${pending}\n${raw}` : raw
    if (!line) continue
    if (quoteCount(line) % 2 === 1) {
      pending = line
      continue
    }
    pending = ""
    const fields = parseCsvLine(line)
    if (!header) {
      header = fields
      continue
    }
    const row: Record<string, string> = {}
    header.forEach((h, i) => (row[h] = fields[i] ?? ""))
    onRow(row)
  }
}

function quoteCount(s: string): number {
  let n = 0
  for (let i = s.indexOf('"'); i !== -1; i = s.indexOf('"', i + 1)) n++
  return n
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      out.push(field)
      field = ""
    } else field += c
  }
  out.push(field)
  return out
}

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

await main()
