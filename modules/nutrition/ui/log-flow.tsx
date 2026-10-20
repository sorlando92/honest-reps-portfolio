"use client"

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, ScanBarcode, Search, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { track } from "@/core/events/client"
import { useOnline } from "@/lib/use-online"
import type { FoodResult, SearchHit } from "../foods/hits"
import { mealFor, type Meal, type MealAnchors, type MealWindows } from "../entries/meals"
import { loggedAtFor } from "../entries/logged-at"
import type { QuickAddChip } from "../entries/quick-add"
import type { DraftItem, DraftResult } from "../parsing/service"
import { defaultUnit, totals, type WeightUnit } from "./amounts"
import { BarcodeScanner, type Scan } from "./barcode-scanner"
import { CardSheet } from "./card-sheet"
import { clearDraft, draftSnapshot, parseDraft, saveDraft, subscribeDraft, type StoredDraft } from "./draft-store"
import { toEntryItem } from "./entry-items"
import { FoodSearch } from "./food-search"
import { LabelScan } from "./label-scan"
import { SearchResults } from "./search-results"
import { resolveHit, resultCount, useFoodSearch, type SearchState } from "./use-food-search"
import { ItemRow } from "./item-row"
import { MealChips } from "./meal-chips"
import { LOG_MEAL_EVENT } from "./meal-section-controls"
import { LOG_OPEN_EVENT, type LogOpen } from "./today/today-events"
import { changedFood, fromSearchResult } from "./new-items"

type Phase = { kind: "idle" } | { kind: "reading"; text: string } | { kind: "error"; text: string; message: string }

/** "Not this" on a barcode result: the food picked next becomes the user's match for the GTIN. */
interface NotThis {
  scan: Scan
  returnedId: string
}

/**
 * A panel inside the card: search to add a row (optionally opening on a new
 * custom food, saved on a barcode), search to change the food on row
 * `index`, scan a barcode, or scan a label (docs/FOOD_LOOKUP_SPEC.md 3).
 */
type Searching =
  | { query: string; target: "add"; manual?: boolean; gtin?: string | null; notThis?: NotThis; scan?: Scan }
  | { query: string; target: "change"; index: number }
  | { query: ""; target: "scan" }
  | { query: ""; target: "label"; scan: Scan | null }

type Method = "text" | "search" | "manual" | "barcode"

/** Shown while the coach has AI off for this client (core/auth/ai-access.ts AI_DISABLED). */
const AI_OFF = "AI logging is off. Your coach will turn it on."

/**
 * The log loop on Today: describe a meal or search for foods, check the
 * card, tap Log it (PRD F2, DESIGN_SYSTEM.md "Log bar" and "Log confirmation").
 */
export function LogFlow({
  units,
  hasScale,
  chips,
  timezone,
  mealWindows,
  mealAnchors,
  date,
  afterLog,
  aiEnabled,
}: {
  units: "imperial" | "metric"
  hasScale: boolean | null
  chips: QuickAddChip[]
  timezone: string
  mealWindows: MealWindows
  mealAnchors: MealAnchors
  /** The selected local day; new logs go to it (PRD F3, Q52). */
  date: string
  /** NAV_SPEC 3: on Progress, logs go to today and the app switches to Today after Log it. */
  afterLog?: "today"
  /**
   * Set by the coach. Off: no "Describe with AI" and no label scan, and send
   * opens food search with what was typed. Search, barcode, quick add and
   * "Enter it yourself" still log.
   */
  aiEnabled: boolean
}) {
  const router = useRouter()
  const online = useOnline()
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [searching, setSearching] = useState<Searching | null>(null)
  const [unit, setUnit] = useState<WeightUnit>(defaultUnit(units, hasScale))
  const [announce, setAnnounce] = useState("")
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  // The card under review lives in device storage, so one left unconfirmed
  // reopens with the app (PRD F2 "Draft"). The server render never has one.
  const raw = useSyncExternalStore(subscribeDraft, draftSnapshot, () => null)
  const draft = useMemo(() => parseDraft(raw), [raw])
  const [sheetOpen, setSheetOpen] = useState(true)

  // A section's "+" picks the meal for the next log and focuses the bar.
  const [pendingMeal, setPendingMeal] = useState<Meal | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // FOOD_LOOKUP_SPEC 1: the search glyph and the "Search food" quick action open the bar's results.
  const [browse, setBrowse] = useState(0)
  useEffect(() => {
    const onMeal = (e: Event) => {
      setPendingMeal((e as CustomEvent<Meal>).detail)
      inputRef.current?.focus()
    }
    window.addEventListener(LOG_MEAL_EVENT, onMeal)
    // The "+" sheet (NAV_SPEC 2): Search food and Scan barcode.
    const onOpen = (e: Event) => {
      const mode = (e as CustomEvent<LogOpen>).detail
      if (mode === "search") return setBrowse((n) => n + 1)
      setSearching({ query: "", target: "scan" })
      setSheetOpen(true)
    }
    window.addEventListener(LOG_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener(LOG_MEAL_EVENT, onMeal)
      window.removeEventListener(LOG_OPEN_EVENT, onOpen)
    }
  }, [])
  /** The meal a new card or quick add files under: the chosen section, else the time of day. */
  const nextMeal = (): Meal => pendingMeal ?? mealFor(new Date(), timezone, mealWindows)
  /** Fields every new card starts with: its meal, whether the user chose it, and its day. */
  const startFields = () => ({ meal: nextMeal(), mealChosen: pendingMeal !== null, date })
  const stamp = (day: string, meal: Meal | null) => loggedAtFor(day, meal, timezone, mealAnchors).toISOString()

  async function read(text: string) {
    setPhase({ kind: "reading", text })
    setSearching(null)
    setSaveError(null)
    try {
      const now = new Date()
      const localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, localTime }),
      })
      if (res.status === 403) throw new Error(`${AI_OFF} Search for each food for now.`)
      if (res.status === 429) throw new Error("Too many meals in an hour. Try again in a few minutes.")
      if (!res.ok) throw new Error("We could not read that meal. Try again.")
      const result = (await res.json()) as DraftResult
      // AI_PROMPTS.md P1 fallback: search, prefilled with what they typed.
      if (result.fallback) {
        setPhase({ kind: "idle" })
        startSearch({ query: text, target: "add" })
        return
      }
      if (result.items.length === 0) throw new Error("No food found in that. Try naming what you ate.")
      saveDraft({ text, method: "text", ...startFields(), aiCallId: result.aiCallId, items: result.items, clientUuid: crypto.randomUUID(), createdAt: Date.now() })
      setPhase({ kind: "idle" })
      setSheetOpen(true)
    } catch (error) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine
      setPhase({
        kind: "error",
        text,
        message: offline ? "You're offline. Try again when you're back online." : error instanceof Error ? error.message : "Something went wrong. Try again.",
      })
    }
  }

  function startSearch(next: Searching) {
    setSearching(next)
    setSheetOpen(true)
  }

  function picked(item: DraftItem, from: Searching, method: Method, apply: (items: DraftItem[]) => DraftItem[], scanId: string | null = null) {
    if (draft) {
      saveDraft({ ...draft, items: apply(draft.items) })
    } else if (from.target !== "change") {
      saveDraft({ text: "", method, ...startFields(), aiCallId: null, scanId, items: [item], clientUuid: crypto.randomUUID(), createdAt: Date.now() })
    }
    setSearching(null)
    setSheetOpen(true)
  }

  /** A log bar result: one item on a card, without the model (FOOD_LOOKUP_SPEC 1). A favorite logs in one tap like its chip. */
  async function pickHit(hit: SearchHit): Promise<boolean> {
    if (hit.favoriteItems) {
      quickAdd({
        key: hit.ref,
        kind: "favorite",
        title: hit.name,
        calories: hit.kcal,
        items: hit.favoriteItems.map((i) => ({ ...i, flagReason: null, confidence: null })),
      })
      return true
    }
    const result = await resolveHit(hit)
    if (!result) {
      setAnnounce(online ? "That food did not load. Try again." : "You're offline. Try again when you're back online.")
      return false
    }
    const item = fromSearchResult(result)
    picked(item, { query: "", target: "add" }, "search", (items) => [...items, item])
    return true
  }

  /** Records what the user did with a barcode result in the scan log. */
  function scanOutcome(scan: Scan, body: { outcome: "confirmed" } | { outcome: "not_this"; chosenFoodItemId: string | null } | { outcome: "replaced"; chosenFoodItemId: string }) {
    if (!scan.scanId) return
    void fetch(`/api/foods/barcode/scans/${scan.scanId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {})
  }

  // Barcode "Log it" (FOOD_LOOKUP_SPEC 3, QUESTIONS.md Q65): with no card open it logs one
  // serving right away; scanned from Add item it joins the open card.
  const [scanBusy, startScanLog] = useTransition()
  function confirmScan(result: FoodResult, scan: Scan) {
    scanOutcome(scan, { outcome: "confirmed" })
    const item = fromSearchResult(result)
    if (draft) return picked(item, { query: "", target: "scan" }, "barcode", (items) => [...items, item])
    startScanLog(async () => {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientUuid: crypto.randomUUID(),
          loggedAt: stamp(date, pendingMeal),
          method: "barcode",
          meal: nextMeal(),
          aiCallId: null,
          scanId: scan.scanId,
          items: [toEntryItem(item)],
        }),
      }).catch(() => null)
      if (!res || !res.ok) {
        // Not lost: the product waits on a card for another try.
        picked(item, { query: "", target: "scan" }, "barcode", (items) => [...items, item], scan.scanId)
        setSaveError("Not logged yet. Your card is kept here. Try again.")
        return
      }
      setSearching(null)
      setPendingMeal(null)
      setAnnounce(`Logged ${result.name}.`)
      navigator.vibrate?.(10)
      if (afterLog === "today") router.push("/today")
      else router.refresh()
    })
  }

  /** The food picked after "Not this" is saved as the user's match for that GTIN. */
  function correctedScan(notThis: NotThis, result: FoodResult) {
    scanOutcome(notThis.scan, { outcome: "not_this", chosenFoodItemId: result.foodItemId })
    track("barcode_mismatch", { normalized_gtin: notThis.scan.gtin, returned_food_id: notThis.returnedId, chosen_food_id: result.foodItemId })
  }

  function logIt(draft: StoredDraft) {
    setSaveError(null)
    startSaving(async () => {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientUuid: draft.clientUuid,
          loggedAt: stamp(draft.date ?? date, draft.mealChosen ? (draft.meal ?? null) : null),
          method: draft.aiCallId ? "text" : (draft.method ?? "search"),
          meal: draft.meal ?? nextMeal(),
          aiCallId: draft.aiCallId,
          scanId: draft.aiCallId ? null : (draft.scanId ?? null),
          items: draft.items.map((i) => toEntryItem(i)),
        }),
      }).catch(() => null)
      if (!res || !res.ok) {
        setSaveError("Not logged yet. Your card is kept here. Try again.")
        return
      }
      clearDraft()
      setPendingMeal(null)
      setPhase({ kind: "idle" })
      setAnnounce("Logged.")
      navigator.vibrate?.(10)
      if (afterLog === "today") router.push("/today")
      else router.refresh()
    })
  }

  // Quick add and favorites: one tap logs, no card and no model (PRD F2).
  const [quickBusy, startQuick] = useTransition()
  function quickAdd(chip: QuickAddChip) {
    startQuick(async () => {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientUuid: crypto.randomUUID(),
          loggedAt: stamp(date, pendingMeal),
          method: "quick_add",
          meal: nextMeal(),
          aiCallId: null,
          title: chip.kind === "favorite" ? chip.title : null,
          quickAddSource: chip.kind,
          items: chip.items,
        }),
      }).catch(() => null)
      if (!res || !res.ok) {
        setAnnounce("Not logged. Try again.")
        return
      }
      setPendingMeal(null)
      setAnnounce(`Logged ${chip.title}.`)
      navigator.vibrate?.(10)
      if (afterLog === "today") router.push("/today")
      else router.refresh()
    })
  }

  function discard() {
    clearDraft()
    setSearching(null)
    setPhase({ kind: "idle" })
  }

  const showCard = draft !== null && phase.kind === "idle" && searching === null
  const open = phase.kind !== "idle" || searching !== null || (draft !== null && sheetOpen)
  const sum = showCard ? totals(draft.items) : null

  return (
    <>
      <LogBar
        disabled={phase.kind === "reading"}
        aiEnabled={aiEnabled}
        onSubmit={aiEnabled ? read : (text) => startSearch({ query: text, target: "add" })}
        onPickHit={pickHit}
        browse={browse}
        onScan={() => startSearch({ query: "", target: "scan" })}
        onLabel={aiEnabled ? () => startSearch({ query: "", target: "label", scan: null }) : undefined}
        onManual={(text) => startSearch({ query: text, target: "add", manual: true })}
        chips={chips}
        onChip={quickAdd}
        chipsDisabled={quickBusy || !online}
        inputRef={inputRef}
        placeholder={pendingMeal ? `What did you have for ${pendingMeal === "snack" ? "a snack" : pendingMeal}?` : "What did you eat?"}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <CardSheet
        open={open}
        onOpenChange={(next) => {
          // Closing keeps the draft on the device; it reopens with the app.
          if (next || phase.kind === "reading") return
          setPhase({ kind: "idle" })
          setSearching(null)
          setSheetOpen(false)
        }}
        title={
          searching
            ? searching.target === "change"
              ? "Change food"
              : searching.target === "scan"
                ? "Scan a barcode"
                : searching.target === "label"
                  ? "Scan the label"
                  : searching.notThis
                    ? "Find the right food"
                    : "Add food"
            : "Your meal"
        }
        summary={
          sum
            ? `${sum.calories} cal · ${sum.proteinG} g protein`
            : searching
              ? searching.target === "scan"
                ? "Scan or type the number under the barcode."
                : searching.target === "label"
                  ? "Saved to My foods, so the next scan finds it."
                  : "Search, or enter a food yourself."
              : phase.kind === "reading"
                ? "Reading your meal."
                : " "
        }
        footer={
          showCard && (
            <>
              {/* QUESTIONS.md Q46: no offline queue in MVP; the draft waits on the phone. */}
              {!online && (
                <p role="status" className="text-body text-text-muted">
                  You&rsquo;re offline. Your draft is saved on this phone. Log it when you&rsquo;re back online.
                </p>
              )}
              {online && saveError && (
                <p role="alert" className="text-body text-caution">
                  {saveError}
                </p>
              )}
              <Button onClick={() => logIt(draft)} disabled={saving || !online}>
                {saving ? "Logging" : "Log it"}
              </Button>
              <Button variant="secondary" onClick={() => startSearch({ query: "", target: "add" })} disabled={saving}>
                Add item
              </Button>
              <Button variant="text" onClick={discard} disabled={saving}>
                Discard
              </Button>
            </>
          )
        }
      >
        {phase.kind === "reading" && (
          <p role="status" className="py-6 text-body text-text-muted">
            Matching &ldquo;{phase.text}&rdquo; to foods.
          </p>
        )}
        {phase.kind === "error" && (
          <div role="alert" className="flex flex-col gap-3 py-4">
            <p className="text-body">{phase.message}</p>
            <Button variant="secondary" onClick={() => read(phase.text)}>
              Try again
            </Button>
          </div>
        )}
        {searching?.target === "scan" && phase.kind === "idle" && (
          <>
            {online && saveError && (
              <p role="alert" className="pb-3 text-body text-caution">
                {saveError}
              </p>
            )}
            <BarcodeScanner
              confirmLabel={draft ? "Add to meal" : scanBusy ? "Logging" : "Log it"}
              onConfirm={confirmScan}
              onNotThis={(result, scan) => {
                scanOutcome(scan, { outcome: "not_this", chosenFoodItemId: null })
                const words = [result.brand, result.name].filter(Boolean).join(" ").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim()
                setSearching({ query: words.slice(0, 100), target: "add", notThis: { scan, returnedId: result.foodItemId } })
              }}
              onLabel={aiEnabled ? (scan) => setSearching({ query: "", target: "label", scan }) : undefined}
              onSearch={(scan) => setSearching({ query: "", target: "add", scan })}
              onManual={(scan) => setSearching({ query: "", target: "add", manual: true, gtin: scan.gtin, scan })}
              onCancel={() => setSearching(null)}
            />
          </>
        )}
        {searching?.target === "label" && phase.kind === "idle" && (
          <LabelScan
            gtin={searching.scan?.gtin ?? null}
            onSaved={(result) => {
              if (searching.scan) scanOutcome(searching.scan, { outcome: "replaced", chosenFoodItemId: result.foodItemId })
              const item = fromSearchResult(result)
              picked(item, searching, searching.scan ? "barcode" : "manual", (items) => [...items, item], searching.scan?.scanId ?? null)
            }}
            onCancel={() => setSearching(null)}
          />
        )}
        {searching && (searching.target === "add" || searching.target === "change") && phase.kind === "idle" && (
          <FoodSearch
            startManual={searching.target === "add" && searching.manual}
            key={`${searching.target}-${searching.query}-${searching.target === "add" && searching.manual ? "manual" : ""}`}
            initialQuery={searching.query}
            gtin={searching.target === "add" ? (searching.gtin ?? null) : null}
            allowManual={searching.target === "add"}
            onLabel={aiEnabled && searching.target === "add" ? () => setSearching({ query: "", target: "label", scan: searching.notThis?.scan ?? searching.scan ?? null }) : undefined}
            cancelLabel={draft ? "Back to your meal" : "Cancel"}
            onCancel={() => setSearching(null)}
            onPick={({ item, result, method }) => {
              const from = searching
              if (from.target === "change") {
                picked(item, from, "search", (items) => items.map((it, i) => (i === from.index ? changedFood(it, result) : it)))
                return
              }
              if (from.notThis) correctedScan(from.notThis, result)
              else if (from.scan) scanOutcome(from.scan, { outcome: "replaced", chosenFoodItemId: result.foodItemId })
              const scan = from.notThis?.scan ?? from.scan ?? null
              picked(item, from, scan ? "barcode" : method, (items) => [...items, item], scan?.scanId ?? null)
            }}
          />
        )}
        {showCard && <MealChips value={draft.meal ?? nextMeal()} onChange={(meal) => saveDraft({ ...draft, meal, mealChosen: true })} />}
        {showCard && (
          <ul className="flex flex-col gap-3 pb-3">
            {draft.items.map((item, index) => (
              <ItemRow
                key={index}
                item={item}
                unit={unit}
                onUnitChange={setUnit}
                onChange={(next) => saveDraft({ ...draft, items: draft.items.map((it, i) => (i === index ? next : it)) })}
                onRemove={() => {
                  const items = draft.items.filter((_, i) => i !== index)
                  if (items.length) saveDraft({ ...draft, items })
                  else discard()
                }}
                onChangeFood={() => startSearch({ query: item.name, target: "change", index })}
              />
            ))}
          </ul>
        )}
        {showCard && draft.items.some((i) => i.match?.source === "off") && (
          // PRD F2: attribution on barcode results.
          <p className="pb-3 text-caption text-text-muted">
            Food data from{" "}
            <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent-strong underline">
              Open Food Facts
            </a>
          </p>
        )}
      </CardSheet>
    </>
  )
}

/**
 * Pinned above the tab bar, always within thumb reach. Never more than three
 * controls (DESIGN_SYSTEM "Log bar", Q47): an empty field shows search and
 * barcode; once the user types, they give way to send. One bar, two
 * functions (docs/FOOD_LOOKUP_SPEC.md 1): typing opens live results above
 * it, row 1 runs AI; send and Enter always mean AI.
 */
function LogBar({
  disabled,
  aiEnabled,
  onSubmit,
  onPickHit,
  browse,
  onScan,
  onLabel,
  onManual,
  chips,
  onChip,
  chipsDisabled,
  inputRef,
  placeholder,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  placeholder: string
  disabled: boolean
  /** Off: send and Enter search instead of running AI, and the AI row is gone. */
  aiEnabled: boolean
  onSubmit: (text: string) => void
  /** A tapped result; false when it could not load (the sheet stays open). */
  onPickHit: (hit: SearchHit) => Promise<boolean>
  /** Bumped by the "Search food" quick action: focus the field and show results. */
  browse: number
  onScan: () => void
  /** The empty state: "Scan the label" (only with AI on) and "Enter it yourself" with what was typed. */
  onLabel?: () => void
  onManual: (text: string) => void
  chips: QuickAddChip[]
  onChip: (chip: QuickAddChip) => void
  chipsDisabled: boolean
}) {
  const id = useId()
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  // Opened from the search glyph: results show even before typing (the user's usual foods).
  const [browsing, setBrowsing] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const typing = text.trim().length > 0
  const sheetOpen = focused && !disabled && !dismissed && (text.trim().length >= MIN_SEARCH || (browsing && !typing))
  const search = useFoodSearch(text, sheetOpen)
  // The last settled results, for search_performed when the user leaves without choosing.
  const seen = useRef<{ state: SearchState; text: string; chosen: boolean } | null>(null)
  useEffect(() => {
    if (search.kind === "results" && search.query.length >= MIN_SEARCH) seen.current = { state: search, text: search.query, chosen: false }
  }, [search])

  function report(choice: { section: string | null; rank: number | null; ai: boolean }) {
    const last = seen.current
    if (!last || last.chosen || last.state.kind !== "results") return
    last.chosen = true
    track("search_performed", {
      chars: last.text.length,
      results_count: resultCount(last.state.sections),
      chosen_section: choice.section,
      chosen_rank: choice.rank,
      chose_ai: choice.ai,
    })
  }

  // A new "Search food" request opens the results (derived from the prop, not an effect).
  const [seenBrowse, setSeenBrowse] = useState(browse)
  if (browse !== seenBrowse) {
    setSeenBrowse(browse)
    setBrowsing(true)
    setDismissed(false)
  }
  useEffect(() => {
    if (browse) inputRef.current?.focus()
  }, [browse, inputRef])

  function submit() {
    const value = text.trim()
    if (!value || disabled) return
    report({ section: null, rank: null, ai: aiEnabled })
    onSubmit(value)
    setText("")
    setBrowsing(false)
  }

  async function pick(hit: SearchHit, rank: number) {
    setBusy(hit.ref)
    const ok = await onPickHit(hit)
    setBusy(null)
    if (!ok) return
    report({ section: hit.section, rank, ai: false })
    setText("")
    setBrowsing(false)
    inputRef.current?.blur()
  }

  function close() {
    report({ section: null, rank: null, ai: false })
    setBrowsing(false)
  }

  // DESIGN_SYSTEM "Log bar": quick add chips show while the bar has focus.
  const showChips = focused && !typing && !sheetOpen && chips.length > 0
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setFocused(false)
        close()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && sheetOpen) {
          e.preventDefault()
          setDismissed(true)
          close()
        }
      }}
      className="log-bar hide-on-keyboard-unless-focused fixed inset-x-0 z-30 px-4"
    >
      {sheetOpen && (
        <div
          role="region"
          aria-label="Food search results"
          className="mx-auto mb-2 max-h-[min(55dvh,30rem)] max-w-[720px] overflow-y-auto overscroll-contain rounded-lg border border-border bg-bg p-2"
        >
          <SearchResults
            id={`${id}-results`}
            state={search}
            query={text}
            onPick={pick}
            busyRef={busy}
            onAI={aiEnabled && typing ? submit : undefined}
            onLabel={
              onLabel &&
              (() => {
                report({ section: null, rank: null, ai: false })
                onLabel()
              })
            }
            onManual={() => {
              report({ section: null, rank: null, ai: false })
              onManual(text.trim())
              setText("")
            }}
          />
          {!typing && search.kind === "results" && resultCount(search.sections) === 0 && (
            <p className="px-1 py-2 text-body text-text-muted">{aiEnabled ? "Type a food to search, or describe a meal and send it." : "Type a food to search."}</p>
          )}
          {!aiEnabled && <p className="px-1 py-2 text-caption text-text-muted">{AI_OFF}</p>}
        </div>
      )}
      {showChips && (
        <ul aria-label="Quick add" className="mx-auto mb-2 flex max-w-[720px] gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => (
            <li key={chip.key} className="shrink-0">
              <button
                type="button"
                disabled={chipsDisabled}
                // iPhone Safari does not focus tapped buttons, so the field would
                // blur and hide the chips before the tap lands.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onChip(chip)}
                aria-label={`Log ${chip.title}, ${chip.calories} calories${chip.kind === "favorite" ? ", favorite" : ""}`}
                className="flex min-h-11 max-w-[16rem] items-center gap-1.5 rounded-full bg-surface px-4 text-body disabled:opacity-50"
              >
                {chip.kind === "favorite" && <Star aria-hidden className="size-4 shrink-0 fill-current text-accent-strong" />}
                <span className="truncate">{chip.title}</span>
                <span className="shrink-0 text-caption text-text-muted tabular-nums">{chip.calories}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* DESIGN_SYSTEM "Log bar": a floating pill. Leading search, the field, then barcode, or send while typing. */}
      <div className="mx-auto flex max-w-[720px] items-center gap-1 rounded-full border border-border bg-surface p-1">
        <Button
          type="button"
          variant="text"
          size="icon"
          aria-label="Search foods"
          aria-expanded={sheetOpen}
          aria-controls={sheetOpen ? `${id}-results` : undefined}
          onPointerDown={(e) => e.preventDefault()}
          disabled={disabled}
          onClick={() => {
            setBrowsing(true)
            setDismissed(false)
            inputRef.current?.focus()
          }}
          className="size-11 shrink-0 rounded-full"
        >
          <Search aria-hidden />
        </Button>
        <label htmlFor={`${id}-meal`} className="sr-only">
          {aiEnabled ? "What did you eat? Type to search foods, or describe a meal and send it." : "What did you eat? Type to search foods."}
        </label>
        <input
          ref={inputRef}
          id={`${id}-meal`}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setDismissed(false)
          }}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          maxLength={2000}
          aria-controls={sheetOpen ? `${id}-results` : undefined}
          className="h-11 min-w-0 flex-1 bg-transparent px-1 text-body text-text outline-none placeholder:text-text-muted"
        />
        {typing ? (
          <Button
            type="submit"
            size="icon"
            aria-label={aiEnabled ? "Log meal" : "Search for this food"}
            onPointerDown={(e) => e.preventDefault()}
            disabled={disabled}
            className="size-11 shrink-0 rounded-full"
          >
            {aiEnabled ? <ArrowUp aria-hidden /> : <Search aria-hidden />}
          </Button>
        ) : (
          <Button type="button" variant="text" size="icon" aria-label="Scan a barcode" onPointerDown={(e) => e.preventDefault()} disabled={disabled} onClick={onScan} className="size-11 shrink-0 rounded-full">
            <ScanBarcode aria-hidden />
          </Button>
        )}
      </div>
    </form>
  )
}

/** FOOD_LOOKUP_SPEC 1: results open from 2 characters. */
const MIN_SEARCH = 2
