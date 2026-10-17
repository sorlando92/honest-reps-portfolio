"use client"

import { useId, useState } from "react"
import { track } from "@/core/events/client"
import { Button } from "@/components/ui/button"
import type { FoodResult, SearchHit } from "../foods/hits"
import type { DraftItem } from "../parsing/service"
import { CustomFoodForm, EMPTY_FOOD } from "./custom-food-form"
import { fromSearchResult } from "./new-items"
import { SearchResults } from "./search-results"
import { resolveHit, resultCount, useFoodSearch } from "./use-food-search"

export type PickMethod = "search" | "manual"

/**
 * Search as you type inside the card (docs/FOOD_LOOKUP_SPEC.md 1): Add item,
 * Change food, the parse fallback and "Not this". No AI row here. "Enter it
 * yourself" saves a custom food (FOOD_LOOKUP_SPEC 4) and adds one serving.
 */
export function FoodSearch({
  initialQuery = "",
  allowManual = true,
  onPick,
  onLabel,
  onCancel,
  cancelLabel,
  startManual = false,
  gtin = null,
}: {
  /** Opens straight on "Enter it yourself" (barcode not found). */
  startManual?: boolean
  initialQuery?: string
  allowManual?: boolean
  onPick: (pick: { item: DraftItem; result: FoodResult; method: PickMethod }) => void
  /** "Scan the label" when nothing matches. */
  onLabel?: () => void
  onCancel: () => void
  cancelLabel: string
  /** A barcode the custom food is saved on. */
  gtin?: string | null
}) {
  const id = useId()
  const [query, setQuery] = useState(initialQuery)
  const [manual, setManual] = useState(startManual)
  const [busy, setBusy] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const state = useFoodSearch(query, !manual)

  async function pick(hit: SearchHit, rank: number) {
    setPickError(null)
    setBusy(hit.ref)
    const result = await resolveHit(hit)
    setBusy(null)
    if (!result) return setPickError(navigator.onLine ? "That food did not load. Try again." : "You're offline. Try again when you're back online.")
    if (state.kind === "results") {
      track("search_performed", { chars: query.trim().length, results_count: resultCount(state.sections), chosen_section: hit.section, chosen_rank: rank, chose_ai: false })
    }
    onPick({ item: fromSearchResult(result), result, method: "search" })
  }

  if (manual) {
    return (
      <CustomFoodForm
        initial={{ ...EMPTY_FOOD, name: query.trim(), gtin: gtin ? gtin.replace(/^0+(?=\d{12,13}$)/, "") : "" }}
        source="manual"
        showBarcode={Boolean(gtin)}
        submitLabel="Save and add"
        note="Saved to My foods, so you can find it next time."
        onSaved={(result) => onPick({ item: fromSearchResult(result), result, method: "manual" })}
        onCancel={() => (startManual ? onCancel() : setManual(false))}
        cancelLabel={startManual ? cancelLabel : "Back to search"}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div role="search">
        <label htmlFor={`${id}-q`} className="sr-only">
          Search foods
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          autoFocus
          aria-controls={`${id}-results`}
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-body text-text placeholder:text-text-muted"
        />
      </div>
      {pickError && (
        <p role="alert" className="text-body">
          {pickError}
        </p>
      )}
      <SearchResults
        id={`${id}-results`}
        state={state}
        query={query}
        onPick={pick}
        busyRef={busy}
        onLabel={onLabel}
        onManual={allowManual ? () => setManual(true) : undefined}
      />
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
