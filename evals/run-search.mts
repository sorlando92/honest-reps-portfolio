// Search eval (docs/FOOD_LOOKUP_SPEC.md "Test sets"): each query in
// evals/search.jsonl against the local food index, as a user with no
// history. A case passes at rank N when a food whose brand plus name holds
// every word of one of its `expect` sets is within the first N rows of the
// section it belongs to (Brands or Basic), as the sheet lists them.
// Pass: top 3 for 90% of cases, top 5 for all of them.
//
//   pnpm eval:search                      local (.env.local)
//   node --env-file=.env.hosted evals/run-search.mts   hosted
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

interface Case {
  id: string
  category: string
  query: string
  section: "brands" | "basic"
  expect: string[][]
  /** Plain item cases (PM 2026-10-17): must be first, and a Foundation or SR Legacy item. */
  first?: boolean
  note?: string
}

interface Row {
  section: string
  name: string
  brand: string | null
  data_type: string | null
}

const norm = (s: string) => s.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9%]+/g, " ").trim()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const cases = readFileSync(new URL("./search.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Case)

const results: { c: Case; rank: number | null; ms: number; top: string[] }[] = []
for (const c of cases) {
  const started = performance.now()
  const { data, error } = await admin.rpc("search_food_index", { p_query: c.query, p_limit: 15 })
  const ms = performance.now() - started
  if (error) throw new Error(`${c.id}: ${error.message}`)
  const rows = ((data ?? []) as Row[]).filter((r) => r.section === c.section)
  const hit = rows.findIndex((r) => {
    const text = ` ${norm(`${r.brand ?? ""} ${r.name}`)} `
    const plain = !c.first || r.data_type === "Foundation" || r.data_type === "SR Legacy"
    return plain && c.expect.some((words) => words.every((w) => text.includes(norm(w))))
  })
  results.push({ c, rank: hit < 0 ? null : hit + 1, ms, top: rows.slice(0, 3).map((r) => `${r.brand ? `${r.brand} | ` : ""}${r.name}`) })
}

const within = (n: number) => results.filter((r) => r.rank !== null && r.rank <= n).length
const pct = (n: number) => Math.round((n / results.length) * 100)
for (const r of results) {
  const mark = r.rank === null ? "MISS" : r.rank <= 3 ? `#${r.rank}` : `#${r.rank} (outside top 3)`
  console.log(`${r.c.id} ${r.c.category.padEnd(7)} ${r.c.query.padEnd(38)} ${mark.padEnd(18)} ${Math.round(r.ms)} ms`)
  if (r.rank === null || r.rank > 3) for (const t of r.top) console.log(`      ${t}`)
}
const plain = results.filter((r) => r.c.first)
const plainFirst = plain.filter((r) => r.rank === 1).length
const times = results.map((r) => r.ms).sort((a, b) => a - b)
const top3 = within(3)
const top5 = within(5)
console.log(`\n${results.length} cases on ${new URL(url).host}`)
console.log(`Top 3: ${top3}/${results.length} (${pct(top3)}%), bar 90%: ${pct(top3) >= 90 ? "pass" : "FAIL"}`)
console.log(`Top 5: ${top5}/${results.length} (${pct(top5)}%), bar 100%: ${top5 === results.length ? "pass" : "FAIL"}`)
if (plain.length) console.log(`Plain item first: ${plainFirst}/${plain.length}, bar 100%: ${plainFirst === plain.length ? "pass" : "FAIL"}`)
console.log(`Round trip from this machine: median ${Math.round(times[Math.floor(times.length / 2)])} ms, slowest ${Math.round(times[times.length - 1])} ms`)
process.exitCode = pct(top3) >= 90 && top5 === results.length && plainFirst === plain.length ? 0 : 1
