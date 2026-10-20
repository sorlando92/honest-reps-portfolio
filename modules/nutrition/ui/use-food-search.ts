"use client"

import { useEffect, useRef, useState } from "react"
import type { FoodResult, SearchHit, SearchSections } from "../foods/hits"

/** docs/FOOD_LOOKUP_SPEC.md 1: results update 150 ms after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 150
const MIN_CHARS = 2

export type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; query: string; previous: SearchSections | null }
  | { kind: "results"; query: string; sections: SearchSections }
  | { kind: "error"; query: string; message: string }

export function resultCount(s: SearchSections): number {
  return s.mine.length + s.brands.length + s.basic.length
}

/**
 * Search as you type. Each pause sends one request and aborts the one before,
 * so a slow answer never overwrites a newer one. `enabled` with an empty
 * query loads the user's most logged foods.
 */
export function useFoodSearch(query: string, enabled: boolean): SearchState {
  const [state, setState] = useState<SearchState>({ kind: "idle" })
  const last = useRef<SearchSections | null>(null)
  const q = query.trim()
  const active = enabled && (q.length === 0 || q.length >= MIN_CHARS)

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState({ kind: "loading", query: q, previous: last.current })
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        if (res.status === 429) throw new Error("Too many searches in an hour. Try again in a few minutes.")
        if (!res.ok) throw new Error("Search did not work. Try again.")
        const { sections } = (await res.json()) as { sections: SearchSections }
        last.current = sections
        setState({ kind: "results", query: q, sections })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({ kind: "error", query: q, message: !navigator.onLine ? "You're offline. Search works when you're back online." : error instanceof Error ? error.message : "Search did not work. Try again." })
      }
    }, q.length === 0 ? 0 : SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  return active ? state : { kind: "idle" }
}

/**
 * The food behind a tapped result, ready for the card: food_items rows are
 * ready; an FDC row is copied into food_items first; a generic food without
 * its common portion looks it up (falls back to 100 g).
 */
export async function resolveHit(hit: SearchHit): Promise<FoodResult | null> {
  let food = hit.food
  if (!food && hit.ref.startsWith("fdc:")) {
    const res = await fetch("/api/foods/pick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fdcId: Number(hit.ref.slice(4)) }),
    }).catch(() => null)
    food = res?.ok ? ((await res.json()) as { result: FoodResult }).result : null
  }
  if (food && food.source === "usda" && food.dataType !== "Branded" && !food.portion) {
    const res = await fetch(`/api/foods/${food.foodItemId}/portion`, { signal: AbortSignal.timeout(4000) }).catch(() => null)
    const portion = res?.ok ? ((await res.json()) as { portion: FoodResult["portion"] }).portion : null
    food = { ...food, portion }
  }
  return food
}
