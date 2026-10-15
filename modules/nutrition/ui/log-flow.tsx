"use client"

import { useId, useMemo, useState, useSyncExternalStore, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DraftResult } from "../parsing/service"
import { totals, type WeightUnit } from "./amounts"
import { clearDraft, draftSnapshot, parseDraft, saveDraft, subscribeDraft, type StoredDraft } from "./draft-store"
import { CardSheet } from "./card-sheet"
import { toEntryItem } from "./entry-items"
import { ItemRow } from "./item-row"

type Phase = { kind: "idle" } | { kind: "reading"; text: string } | { kind: "error"; text: string; message: string }

/**
 * The log loop on Today: describe a meal, check the card, tap Log it
 * (PRD F2, DESIGN_SYSTEM.md "Log bar" and "Log confirmation").
 */
export function LogFlow({ units }: { units: "imperial" | "metric" }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [unit, setUnit] = useState<WeightUnit>(units === "metric" ? "g" : "oz")
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
      if (result.fallback || result.items.length === 0) {
        throw new Error(result.fallback ? "We could not read that meal. Try different words." : "No food found in that. Try naming what you ate.")
      }
      const draft: StoredDraft = { text, aiCallId: result.aiCallId, items: result.items, clientUuid: crypto.randomUUID(), createdAt: Date.now() }
      saveDraft(draft)
      setPhase({ kind: "idle" })
      setSheetOpen(true)
    } catch (error) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine
      setPhase({
        kind: "error",
        text,
        message: offline ? "You are offline. Try again when you are back online." : error instanceof Error ? error.message : "Something went wrong. Try again.",
      })
    }
  }

  const update = saveDraft

  function logIt(draft: StoredDraft) {
    setSaveError(null)
    startSaving(async () => {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientUuid: draft.clientUuid,
          loggedAt: new Date().toISOString(),
          method: "text",
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
    setPhase({ kind: "idle" })
  }

  const open = phase.kind !== "idle" || (draft !== null && sheetOpen)
  const sum = draft && phase.kind === "idle" ? totals(draft.items) : null

  return (
    <>
      <LogBar disabled={phase.kind === "reading"} onSubmit={read} />
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <CardSheet
        open={open}
        onOpenChange={(next) => {
          // Closing keeps the draft on the device; it reopens with the app.
          if (next || phase.kind === "reading") return
          setPhase({ kind: "idle" })
          setSheetOpen(false)
        }}
        title="Your meal"
        summary={sum ? `${sum.calories} cal · ${sum.proteinG} g protein` : phase.kind === "reading" ? "Reading your meal." : " "}
        footer={
          draft &&
          phase.kind === "idle" && (
            <>
              {saveError && (
                <p role="alert" className="text-body text-caution">
                  {saveError}
                </p>
              )}
              <Button onClick={() => logIt(draft)} disabled={saving}>
                {saving ? "Logging" : "Log it"}
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
        {draft && phase.kind === "idle" && (
          <ul className="flex flex-col gap-3 pb-3">
            {draft.items.map((item, index) => (
              <ItemRow
                key={index}
                item={item}
                unit={unit}
                onUnitChange={setUnit}
                onChange={(next) => update({ ...draft, items: draft.items.map((it, i) => (i === index ? next : it)) })}
                onRemove={() => {
                  const items = draft.items.filter((_, i) => i !== index)
                  if (items.length) update({ ...draft, items })
                  else discard()
                }}
              />
            ))}
          </ul>
        )}
      </CardSheet>
    </>
  )
}

/** Pinned above the tab bar, always within thumb reach. */
function LogBar({ disabled, onSubmit }: { disabled: boolean; onSubmit: (text: string) => void }) {
  const id = useId()
  const [text, setText] = useState("")
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
        <Button type="submit" size="icon" aria-label="Log meal" disabled={disabled || !text.trim()} className="size-12">
          <ArrowUp aria-hidden />
        </Button>
      </div>
    </form>
  )
}
