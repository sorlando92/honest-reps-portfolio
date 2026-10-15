"use client"

import { useId, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FoodResult } from "../foods/search"
import type { DraftItem } from "../parsing/service"
import { fromUnit, type WeightUnit } from "./amounts"
import { fromManual, fromSearchResult } from "./new-items"

type State =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; results: FoodResult[] }
  | { kind: "error"; message: string }
  | { kind: "adding"; results: FoodResult[] }

/**
 * Search for a food, or enter one by hand (PRD F2). Used by Add item, the log
 * bar search button, the parse fallback, and Change food on a row.
 */
export function FoodSearch({
  initialQuery = "",
  unit,
  allowManual = true,
  onPick,
  onCancel,
  cancelLabel,
}: {
  initialQuery?: string
  unit: WeightUnit
  allowManual?: boolean
  onPick: (pick: { item: DraftItem; result: FoodResult | null }) => void
  onCancel: () => void
  cancelLabel: string
}) {
  const id = useId()
  const [query, setQuery] = useState(initialQuery)
  const [state, setState] = useState<State>({ kind: "idle" })
  const [manual, setManual] = useState(false)

  async function search(q: string) {
    if (q.trim().length < 2) return
    setState({ kind: "searching" })
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q.trim())}`)
      if (res.status === 429) throw new Error("Too many searches in an hour. Try again in a few minutes.")
      if (!res.ok) throw new Error("Search did not work. Try again.")
      const { results } = (await res.json()) as { results: FoodResult[] }
      setState({ kind: "results", results })
    } catch (error) {
      const offline = !navigator.onLine
      setState({ kind: "error", message: offline ? "You're offline. Search works when you're back online." : error instanceof Error ? error.message : "Search did not work. Try again." })
    }
  }

  // A generic USDA food starts at its common portion; SR Legacy and Foundation
  // foods look it up once (cached on the server). Falls back to 100 g.
  async function pick(r: FoodResult, results: FoodResult[]) {
    let result = r
    if (r.source === "usda" && !r.portion) {
      setState({ kind: "adding", results })
      const res = await fetch(`/api/foods/${r.foodItemId}/portion`, { signal: AbortSignal.timeout(4000) }).catch(() => null)
      const portion = res?.ok ? ((await res.json()) as { portion: FoodResult["portion"] }).portion : null
      result = { ...r, portion }
    }
    onPick({ item: fromSearchResult(result), result })
  }

  if (manual) {
    return <ManualForm unit={unit} initialName={query} onAdd={(item) => onPick({ item, result: null })} onBack={() => setManual(false)} />
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          search(query)
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Search foods
        </label>
        <input
          id={`${id}-q`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          autoFocus
          className="h-12 min-w-0 flex-1 rounded-md border border-border bg-surface px-4 text-body text-text placeholder:text-text-muted"
        />
        <Button type="submit" size="icon" aria-label="Search" disabled={query.trim().length < 2 || state.kind === "searching"} className="size-12">
          <Search aria-hidden />
        </Button>
      </form>

      {state.kind === "searching" && (
        <p role="status" className="text-body text-text-muted">
          Searching.
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-body">
          {state.message}
        </p>
      )}
      {state.kind === "results" && state.results.length === 0 && (
        <p role="status" className="text-body text-text-muted">
          No foods found. Try other words{allowManual ? " or enter it yourself" : ""}.
        </p>
      )}
      {state.kind === "adding" && (
        <p role="status" className="text-body text-text-muted">
          Adding.
        </p>
      )}
      {state.kind === "results" && state.results.length > 0 && (
        <ul aria-label="Foods" className="flex flex-col gap-1">
          {state.results.map((r) => (
            <li key={r.foodItemId}>
              <button
                type="button"
                onClick={() => pick(r, state.results)}
                className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md bg-surface px-3 py-2 text-left"
              >
                <span className="text-body break-words">{r.name}</span>
                <span className="text-caption text-text-muted tabular-nums">{describe(r)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {allowManual && (
        <Button variant="secondary" onClick={() => setManual(true)}>
          Enter it yourself
        </Button>
      )}
      <Button variant="text" onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  )
}

function describe(r: FoodResult): string {
  if (r.serving) {
    const grams = r.serving.grams ? ` (${Math.round(r.serving.grams)} g)` : ""
    return `${r.brand ? `${r.brand} · ` : ""}${r.serving.label}${grams}: ${Math.round(r.serving.kcal)} cal, ${Math.round(r.serving.protein_g)} g protein`
  }
  const per = r.per100g as { kcal?: number; protein_g?: number }
  return `${r.brand ? `${r.brand} · ` : ""}per 100 g: ${Math.round(per.kcal ?? 0)} cal, ${Math.round(per.protein_g ?? 0)} g protein`
}

/** A food typed in by hand: name, weight, calories and macros. */
function ManualForm({ unit, initialName, onAdd, onBack }: { unit: WeightUnit; initialName: string; onAdd: (item: DraftItem) => void; onBack: () => void }) {
  const id = useId()
  const [values, setValues] = useState({ name: initialName, weight: "", calories: "", protein: "", carbs: "", fat: "" })
  const [error, setError] = useState<string | null>(null)
  const num = (s: string) => (s.trim() === "" ? 0 : Number(s))

  function add() {
    const weight = Number(values.weight)
    const numbers = [values.calories, values.protein, values.carbs, values.fat].map(num)
    if (!values.name.trim()) return setError("Add a name for this food.")
    if (!(weight > 0)) return setError(`Add the weight in ${unit}.`)
    if (values.calories.trim() === "" || numbers.some((n) => !Number.isFinite(n) || n < 0)) return setError("Add calories, and use numbers of 0 or more.")
    onAdd(fromManual({ name: values.name, grams: fromUnit(weight, unit), calories: numbers[0], proteinG: numbers[1], carbsG: numbers[2], fatG: numbers[3] }))
  }

  const field = (key: keyof typeof values, label: string, numeric = true) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${key}`} className="text-label text-text-muted uppercase">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        value={values[key]}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        min={numeric ? 0 : undefined}
        step={numeric ? "any" : undefined}
        maxLength={numeric ? undefined : 300}
        autoComplete="off"
        className="h-12 rounded-md border border-border bg-surface px-4 text-body text-text tabular-nums"
      />
    </div>
  )

  return (
    <form
      aria-label="Enter a food"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
      className="flex flex-col gap-3 pb-4"
    >
      {field("name", "Food", false)}
      <div className="grid grid-cols-2 gap-3">
        {field("weight", `Weight (${unit})`)}
        {field("calories", "Calories")}
        {field("protein", "Protein (g)")}
        {field("carbs", "Carbs (g)")}
        {field("fat", "Fat (g)")}
      </div>
      {error && (
        <p role="alert" className="text-body">
          {error}
        </p>
      )}
      <Button type="submit">Add</Button>
      <Button variant="text" onClick={onBack}>
        Back to search
      </Button>
    </form>
  )
}
