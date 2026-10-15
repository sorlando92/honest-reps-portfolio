"use client"

import { useId, useMemo, useState, useSyncExternalStore, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, ScanBarcode, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useOnline } from "@/lib/use-online"
import type { DraftItem, DraftResult } from "../parsing/service"
import { defaultUnit, totals, type WeightUnit } from "./amounts"
import { BarcodeScanner } from "./barcode-scanner"
import { CardSheet } from "./card-sheet"
import { clearDraft, draftSnapshot, parseDraft, saveDraft, subscribeDraft, type StoredDraft } from "./draft-store"
import { toEntryItem } from "./entry-items"
import { FoodSearch } from "./food-search"
import { ItemRow } from "./item-row"
import { changedFood, fromSearchResult } from "./new-items"

type Phase = { kind: "idle" } | { kind: "reading"; text: string } | { kind: "error"; text: string; message: string }

/**
 * A panel inside the card: search to add a row (optionally opening on manual
 * entry), search to change the food on row `index`, or scan a barcode.
 */
type Searching =
  | { query: string; target: "add"; manual?: boolean }
  | { query: string; target: "change"; index: number }
  | { query: ""; target: "scan" }

type Method = "text" | "search" | "manual" | "barcode"

/**
 * The log loop on Today: describe a meal or search for foods, check the
 * card, tap Log it (PRD F2, DESIGN_SYSTEM.md "Log bar" and "Log confirmation").
 */
export function LogFlow({ units, hasScale }: { units: "imperial" | "metric"; hasScale: boolean | null }) {
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
      saveDraft({ text, method: "text", aiCallId: result.aiCallId, items: result.items, clientUuid: crypto.randomUUID(), createdAt: Date.now() })
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

  function picked(item: DraftItem, from: Searching, method: Method, apply: (items: DraftItem[]) => DraftItem[]) {
    if (draft) {
      saveDraft({ ...draft, items: apply(draft.items) })
    } else if (from.target !== "change") {
      saveDraft({ text: "", method, aiCallId: null, items: [item], clientUuid: crypto.randomUUID(), createdAt: Date.now() })
    }
    setSearching(null)
  }

  function logIt(draft: StoredDraft) {
    setSaveError(null)
    startSaving(async () => {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientUuid: draft.clientUuid,
          loggedAt: new Date().toISOString(),
          method: draft.aiCallId ? "text" : (draft.method ?? "search"),
          mealTag: null,
          aiCallId: draft.aiCallId,
          items: draft.items.map((i) => toEntryItem(i)),
        }),
      }).catch(() => null)
      if (!res || !res.ok) {
        setSaveError("Not logged yet. Your card is kept here. Try again.")
        return
      }
      clearDraft()
      setPhase({ kind: "idle" })
      setAnnounce("Logged.")
      navigator.vibrate?.(10)
      router.refresh()
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
        onSubmit={read}
        onSearch={() => startSearch({ query: "", target: "add" })}
        onScan={() => startSearch({ query: "", target: "scan" })}
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
        title={searching ? (searching.target === "change" ? "Change food" : searching.target === "scan" ? "Scan a barcode" : "Add food") : "Your meal"}
        summary={
          sum
            ? `${sum.calories} cal · ${sum.proteinG} g protein`
            : searching
              ? searching.target === "scan"
                ? "Packaged foods from Open Food Facts."
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
          <BarcodeScanner
            onFound={(result) => {
              const item = fromSearchResult(result)
              picked(item, searching, "barcode", (items) => [...items, item])
            }}
            onSearch={() => setSearching({ query: "", target: "add" })}
            onManual={() => setSearching({ query: "", target: "add", manual: true })}
            onCancel={() => setSearching(null)}
          />
        )}
        {searching && searching.target !== "scan" && phase.kind === "idle" && (
          <FoodSearch
            startManual={searching.target === "add" && searching.manual}
            key={`${searching.target}-${searching.query}`}
            initialQuery={searching.query}
            unit={unit}
            allowManual={searching.target === "add"}
            cancelLabel={draft ? "Back to your meal" : "Cancel"}
            onCancel={() => setSearching(null)}
            onPick={({ item, result }) => {
              const from = searching
              if (from.target === "change" && result) {
                picked(item, from, "search", (items) => items.map((it, i) => (i === from.index ? changedFood(it, result) : it)))
              } else {
                picked(item, from, result === null ? "manual" : "search", (items) => [...items, item])
              }
            }}
          />
        )}
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
 * barcode; once the user types, they give way to send.
 */
function LogBar({ disabled, onSubmit, onSearch, onScan }: { disabled: boolean; onSubmit: (text: string) => void; onSearch: () => void; onScan: () => void }) {
  const id = useId()
  const [text, setText] = useState("")
  const typing = text.trim().length > 0
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const value = text.trim()
        if (!value || disabled) return
        onSubmit(value)
        setText("")
      }}
      className="fixed inset-x-0 z-30 border-t border-border bg-bg px-4 py-2"
      style={{ bottom: "calc(var(--tab-bar-height) + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-[720px] items-center gap-2">
        <label htmlFor={`${id}-meal`} className="sr-only">
          What did you eat?
        </label>
        <input
          id={`${id}-meal`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you eat?"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={2000}
          className="h-12 min-w-0 flex-1 rounded-md border border-border bg-surface px-4 text-body text-text placeholder:text-text-muted"
        />
        {typing ? (
          <Button type="submit" size="icon" aria-label="Log meal" disabled={disabled} className="size-12">
            <ArrowUp aria-hidden />
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" size="icon" aria-label="Search foods" disabled={disabled} onClick={onSearch} className="size-12">
              <Search aria-hidden />
            </Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Scan a barcode" disabled={disabled} onClick={onScan} className="size-12">
              <ScanBarcode aria-hidden />
            </Button>
          </>
        )}
      </div>
    </form>
  )
}
