// Loads USDA FoodData Central Foundation, SR Legacy and FNDDS into
// public.fdc_foods (QUESTIONS.md Q40). Safe to rerun: rows are upserted by
// fdc_id. Download and unzip the CSV releases first, into one folder:
//
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip
//
//   pnpm db:import-fdc --dir <folder>                      local (.env.local)
//   node --conditions=react-server --env-file=.env.hosted scripts/import-fdc.mts --dir <folder>   hosted
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { createReadStream, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { createClient } from "@supabase/supabase-js"
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
const url = need("NEXT_PUBLIC_SUPABASE_URL")
const admin = createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  let total = 0
  for (const ds of DATASETS) {
    const dir = findDataset(root, ds.prefix)
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

    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await admin.from("fdc_foods").upsert(rows.slice(i, i + BATCH), { onConflict: "fdc_id" })
      if (error) throw new Error(`${release}: ${error.message}`)
    }
    console.log(`${release}: ${rows.length} foods (${ids.size - rows.length} skipped without calories)`)
    total += rows.length
  }
  console.log(`Imported ${total} foods into ${new URL(url).host}.`)
}

/** The dataset's folder; zips unpack to a folder holding a same-named folder. */
function findDataset(base: string, prefix: string): { path: string; name: string } {
  const outer = readdirSync(base).find((n) => n.startsWith(prefix) && statSync(join(base, n)).isDirectory())
  if (!outer) throw new Error(`No folder starting with ${prefix} in ${base}`)
  const inner = join(base, outer, outer)
  return { path: statSync(inner, { throwIfNoEntry: false })?.isDirectory() ? inner : join(base, outer), name: outer }
}

/** Calls back with each CSV row as an object keyed by the header. FDC quotes every field. */
async function eachRow(file: string, onRow: (row: Record<string, string>) => void): Promise<void> {
  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity })
  let header: string[] | null = null
  for await (const line of lines) {
    if (!line) continue
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
