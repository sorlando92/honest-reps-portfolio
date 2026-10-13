// pnpm eval:parsing [--runs 3] [--split dev|holdout|all] [--cases p001,p002]
//
// Runs evals/parsing.jsonl through the real parsing pipeline (P1 plus USDA
// matching), scores each run per evals/README.md, and prints the median per
// metric for dev and holdout against the M1 pass bars. Calls the Anthropic
// and USDA APIs with the keys in .env.local, so every run costs money.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { parseMeal } from "../modules/nutrition/parsing/parse-meal.ts"
import {
  addTallies,
  casePassed,
  emptyTally,
  METRICS,
  PASS_BARS,
  rate,
  scoreCase,
  type EvalCase,
  type ReturnedItem,
  type Tally,
} from "./scoring.ts"

// $ per million tokens, input and output (Anthropic list prices).
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
}
const CONCURRENCY = 4

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const runs = Number(arg("runs") ?? 3)
const split = arg("split") ?? "all"
const only = arg("cases")?.split(",")

const cases: EvalCase[] = readFileSync(new URL("./parsing.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((c: EvalCase) => (split === "all" || c.split === split) && (!only || only.includes(c.id)))

interface CaseRun {
  id: string
  split: string
  run: number
  tally: Tally
  passed: boolean
  latencyMs: number
  model: string
  inputTokens: number
  outputTokens: number
  fallback: boolean
  items: (ReturnedItem & { matchScore: number; confidence: number })[]
}

async function runCase(c: EvalCase, run: number): Promise<CaseRun> {
  const result = await parseMeal(c.input, { units: c.units, localTime: "12:30" })
  const items = result.items.map((i) => ({
    name: i.name,
    matchName: i.match?.name ?? null,
    grams: i.grams,
    amountSource: i.amountSource,
    state: i.state,
    flagged: i.flagged,
    calories: i.calories,
    matchScore: i.matchScore,
    confidence: i.confidence,
  }))
  const tally = scoreCase(c, items)
  return {
    id: c.id,
    split: c.split,
    run,
    tally,
    passed: casePassed(tally),
    latencyMs: result.aiCall.latencyMs,
    model: result.aiCall.model,
    inputTokens: result.aiCall.inputTokens,
    outputTokens: result.aiCall.outputTokens,
    fallback: result.fallback,
    items,
  }
}

async function pool<T, R>(inputs: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < inputs.length) {
        const i = next++
        out[i] = await fn(inputs[i])
      }
    })
  )
  return out
}

const jobs = Array.from({ length: runs }, (_, r) => cases.map((c) => ({ c, r: r + 1 }))).flat()
console.log(`Running ${cases.length} cases x ${runs} runs (${jobs.length} parses)...`)
const results = await pool(jobs, ({ c, r }) => runCase(c, r))

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`)

function medianRates(splitName: string): Record<string, number | null> {
  const perRun = Array.from({ length: runs }, (_, r) =>
    results.filter((x) => x.run === r + 1 && x.split === splitName).reduce((t, x) => addTallies(t, x.tally), emptyTally())
  )
  return Object.fromEntries(
    METRICS.map((m) => {
      const rates = perRun.map((t) => rate(t[m])).filter((x): x is number => x !== null)
      return [m, rates.length ? median(rates) : null]
    })
  )
}

const dev = medianRates("dev")
const holdout = medianRates("holdout")
console.log(`\n${"metric".padEnd(20)}   dev  holdout   bar  result`)
for (const m of METRICS) {
  const bar = PASS_BARS[m]
  const ok = [dev[m], holdout[m]].every((x) => x === null || x >= bar)
  const gap = dev[m] !== null && holdout[m] !== null && Math.abs(dev[m]! - holdout[m]!) > 0.05
  console.log(`${m.padEnd(20)} ${pct(dev[m])}   ${pct(holdout[m])}  ${pct(bar)}  ${ok ? "pass" : "FAIL"}${gap ? " (holdout gap > 5 pts)" : ""}`)
}

const byCase = new Map<string, CaseRun[]>()
for (const r of results) byCase.set(r.id, [...(byCase.get(r.id) ?? []), r])
const flips = [...byCase].filter(([, rs]) => new Set(rs.map((r) => r.passed)).size > 1).map(([id]) => id)
const failing = [...byCase].filter(([, rs]) => rs.every((r) => !r.passed)).map(([id]) => id)
console.log(`\nCases failing every run: ${failing.join(", ") || "none"}`)
console.log(`Cases that flip between runs: ${flips.join(", ") || "none"}`)

const tokensIn = results.reduce((s, r) => s + r.inputTokens, 0)
const tokensOut = results.reduce((s, r) => s + r.outputTokens, 0)
const model = results[0]?.model ?? "unknown"
const [pin, pout] = PRICES[model] ?? [0, 0]
const cost = (tokensIn * pin + tokensOut * pout) / 1e6
const latencies = results.map((r) => r.latencyMs)
console.log(
  `\nModel ${model}. P1 latency median ${median(latencies)} ms, max ${Math.max(...latencies)} ms. ` +
    `Tokens ${tokensIn} in, ${tokensOut} out. Cost about $${cost.toFixed(3)} ($${(cost / results.length).toFixed(4)} per parse).` +
    (results.some((r) => r.fallback) ? ` P1 fallbacks: ${results.filter((r) => r.fallback).length}.` : "")
)

mkdirSync(new URL("./results/", import.meta.url), { recursive: true })
const file = new URL(`./results/parsing-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url)
writeFileSync(file, JSON.stringify({ model, runs, dev, holdout, results }, null, 2))
console.log(`Details: ${file.pathname}`)
