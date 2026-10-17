// The scheduled FDC refresh (PM 2026-10-17, Q66), run monthly by
// .github/workflows/fdc-refresh.yml. Finds the newest release of each FDC
// dataset on the download page, imports the ones newer than the last import
// (scripts/import-fdc.mts records rows added, changed and removed), and
// records "no new release" for the rest. FDC publishes Branded Foods a few
// times a year, so most months record no new release.
//
//   node --env-file=.env.local scripts/fdc-refresh.mts [--trigger schedule]
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, curl and unzip.

import { execFileSync } from "node:child_process"
import { appendFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

const PAGE = "https://fdc.nal.usda.gov/download-datasets"
const FILES = "https://fdc.nal.usda.gov/fdc-datasets"
// Our dataset names (fdc_import_runs.dataset and the release prefix the import writes) and FDC's file prefixes.
const DATASETS = [
  { name: "Foundation", prefix: "FoodData_Central_foundation_food_csv_" },
  { name: "SR Legacy", prefix: "FoodData_Central_sr_legacy_food_csv_" },
  { name: "FNDDS", prefix: "FoodData_Central_survey_food_csv_" },
  { name: "Branded", prefix: "FoodData_Central_branded_food_csv_" },
] as const

const url = need("NEXT_PUBLIC_SUPABASE_URL")
const admin = createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } })
const at = process.argv.indexOf("--trigger")
const trigger = at >= 0 && process.argv[at + 1] === "schedule" ? "schedule" : "manual"

const page = await (await fetch(PAGE)).text()
const work = mkdtempSync(join(tmpdir(), "fdc-"))
let toImport = 0
try {
  for (const ds of DATASETS) {
    const dates = [...page.matchAll(new RegExp(`${ds.prefix}(\\d{4}-\\d{2}(?:-\\d{2})?)\\.zip`, "g"))].map((m) => m[1]).sort()
    const latest = dates.at(-1)
    if (!latest) throw new Error(`No ${ds.name} release on ${PAGE}; the page may have changed.`)
    const release = `${ds.name} ${latest}`
    const { data: last } = await admin.from("fdc_import_runs").select("release").eq("dataset", ds.name).eq("imported", true).order("ran_at", { ascending: false }).limit(1).maybeSingle()
    if (last?.release === release) {
      const { error } = await admin.from("fdc_import_runs").insert({ dataset: ds.name, release, imported: false, trigger })
      if (error) throw new Error(`Recording ${ds.name}: ${error.message}`)
      console.log(`${release}: already imported, no new release`)
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${release}: no new release\n`)
      continue
    }
    const zip = join(work, `${ds.prefix}${latest}.zip`)
    console.log(`${release}: downloading`)
    execFileSync("curl", ["-sSfL", "-o", zip, `${FILES}/${ds.prefix}${latest}.zip`], { stdio: "inherit" })
    execFileSync("unzip", ["-q", "-o", zip, "-d", join(work, `${ds.prefix}${latest}`)], { stdio: "inherit" })
    rmSync(zip)
    toImport++
  }
  if (toImport > 0) {
    execFileSync(process.execPath, ["--max-old-space-size=6144", "--conditions=react-server", "scripts/import-fdc.mts", "--dir", work, "--trigger", trigger], { stdio: "inherit", env: process.env })
  } else console.log("Nothing new to import.")
} finally {
  rmSync(work, { recursive: true, force: true })
}

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}
