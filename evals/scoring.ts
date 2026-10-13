// Scores one parse of one case against evals/parsing.jsonl, following
// "Scoring (per run)" in evals/README.md. Pure, so it is unit tested.

import { tokens } from "../modules/nutrition/parsing/match.ts"

export interface ExpectedItem {
  name: string
  aliases: string[]
  grams: [number, number]
  amount_source: string
  state?: "raw" | "cooked" | "dry"
  decomposed_ok?: string[]
}

export interface EvalCase {
  id: string
  split: "dev" | "holdout"
  input: string
  units: "imperial" | "metric"
  expected_items: ExpectedItem[]
  must_not_include: string[]
  expect_flagged: string[]
  meal_kcal: [number, number]
}

/** The parts of a parsed item the scorer reads. */
export interface ReturnedItem {
  name: string
  matchName: string | null
  grams: number
  amountSource: string
  state: string | null
  flagged: boolean
  calories: number
}

/** Pass and total per metric; a metric with total 0 does not apply to the case. */
export type Tally = Record<MetricName, { pass: number; total: number }>

export const METRICS = [
  "item_recall",
  "weighed_grams",
  "other_grams",
  "amount_source",
  "state",
  "meal_kcal",
  "no_invented_foods",
  "flag_calibration",
] as const
export type MetricName = (typeof METRICS)[number]

/** evals/README.md "Pass bars for M1". no_invented_foods must be 100% (zero violations). */
export const PASS_BARS: Record<MetricName, number> = {
  item_recall: 0.9,
  weighed_grams: 1,
  other_grams: 0.85,
  amount_source: 0.9,
  state: 1,
  meal_kcal: 0.8,
  no_invented_foods: 1,
  flag_calibration: 0.8,
}

const has = (haystack: string[], needle: string[]) => needle.length > 0 && needle.every((t) => haystack.includes(t))
const itemTokens = (r: ReturnedItem) => tokens(`${r.name} ${r.matchName ?? ""}`)
const namesOf = (e: ExpectedItem) => [e.name, ...e.aliases]

function matches(expected: ExpectedItem, returned: ReturnedItem): boolean {
  const text = itemTokens(returned)
  return namesOf(expected).some((n) => has(text, tokens(n)))
}

function expectedFlagged(c: EvalCase, e: ExpectedItem): boolean {
  const own = namesOf(e).flatMap(tokens)
  return c.expect_flagged.some((f) => has(own, tokens(f)))
}

export function scoreCase(c: EvalCase, returned: ReturnedItem[]): Tally {
  const tally = Object.fromEntries(METRICS.map((m) => [m, { pass: 0, total: 0 }])) as Tally
  const add = (m: MetricName, ok: boolean) => {
    tally[m].total++
    if (ok) tally[m].pass++
  }
  const unused = new Set(returned.map((_, i) => i))

  for (const e of c.expected_items) {
    const index = [...unused].find((i) => matches(e, returned[i]))
    if (index === undefined) {
      // A dish split into its parts passes recall if every part is there.
      const parts = e.decomposed_ok ?? []
      add("item_recall", parts.length > 0 && parts.every((p) => returned.some((r) => has(itemTokens(r), tokens(p)))))
      continue
    }
    unused.delete(index)
    const r = returned[index]
    add("item_recall", true)

    const [lo, hi] = e.grams
    if (e.amount_source === "weighed") {
      const stated = (lo + hi) / 2
      add("weighed_grams", Math.abs(r.grams - stated) / stated <= 0.03)
    } else {
      add("other_grams", r.grams >= lo && r.grams <= hi)
    }
    add("amount_source", r.amountSource === e.amount_source)
    if (e.state) add("state", r.state === e.state)
    add("flag_calibration", r.flagged === expectedFlagged(c, e))
  }

  const kcal = returned.reduce((sum, r) => sum + r.calories, 0)
  add("meal_kcal", kcal >= c.meal_kcal[0] && kcal <= c.meal_kcal[1])

  const invented = c.must_not_include.some((term) =>
    term === "*" ? returned.length > 0 : returned.some((r) => has(itemTokens(r), tokens(term)))
  )
  add("no_invented_foods", !invented)

  return tally
}

export function emptyTally(): Tally {
  return Object.fromEntries(METRICS.map((m) => [m, { pass: 0, total: 0 }])) as Tally
}

export function addTallies(a: Tally, b: Tally): Tally {
  return Object.fromEntries(
    METRICS.map((m) => [m, { pass: a[m].pass + b[m].pass, total: a[m].total + b[m].total }])
  ) as Tally
}

export function rate(t: { pass: number; total: number }): number | null {
  return t.total ? t.pass / t.total : null
}

/** A case passes when every metric that applies to it passes in full. */
export function casePassed(t: Tally): boolean {
  return METRICS.every((m) => t[m].pass === t[m].total)
}
