"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import type { DraftItem } from "../parsing/service"
import { defaultUnit, totals, type WeightUnit } from "./amounts"
import { CardSheet } from "./card-sheet"
import { FoodSearch } from "./food-search"
import { ItemRow } from "./item-row"
import { changedFood } from "./new-items"
import { toEntryItem } from "./entry-items"

/**
 * Edit and delete for a logged entry (PRD F2), in the same card as a new
 * meal. Saving is the user confirming the entry, so its flags clear. The
 * parent remounts it (key) each time it opens, so edits start from the saved
 * entry.
 */
export function EntryEditor({
  entryId,
  items: saved,
  units,
  hasScale,
  open,
  onOpenChange,
}: {
  entryId: string
  items: DraftItem[]
  units: "imperial" | "metric"
  hasScale: boolean | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const setOpen = onOpenChange
  const [items, setItems] = useState(saved)
  const [unit, setUnit] = useState<WeightUnit>(defaultUnit(units, hasScale))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  // Food search in the editor: add a row, or change the food on row `index`.
  const [searching, setSearching] = useState<{
    query: string
    index: number | null
  } | null>(null)

  function send(method: "PATCH" | "DELETE") {
    setError(null)
    start(async () => {
      const res = await fetch(`/api/entries/${entryId}`, {
        method,
        headers: method === "PATCH" ? { "content-type": "application/json" } : undefined,
        body:
          method === "PATCH"
            ? JSON.stringify({
                items: items.map((i) => toEntryItem({ ...i, flagReason: null }, null)),
              })
            : undefined,
      }).catch(() => null)
      if (!res || !res.ok) {
        setError(method === "PATCH" ? "Not saved yet. Your changes are kept here. Try again." : "Not deleted. Try again.")
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  const sum = totals(items)

  return (
    <>
      <CardSheet
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title={searching ? (searching.index === null ? "Add food" : "Change food") : "Edit entry"}
        summary={searching ? "Search, or enter a food yourself." : `${sum.calories} cal · ${sum.proteinG} g protein`}
        footer={
          !searching && (
            <>
              {error && (
                <p role="alert" className="text-body text-caution">
                  {error}
                </p>
              )}
              {confirmDelete ? (
                <>
                  <p className="text-body">Delete this entry?</p>
                  <Button variant="danger" onClick={() => send("DELETE")} disabled={busy}>
                    {busy ? "Deleting" : "Delete"}
                  </Button>
                  <Button variant="text" onClick={() => setConfirmDelete(false)} disabled={busy}>
                    Keep it
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => send("PATCH")} disabled={busy || items.length === 0}>
                    {busy ? "Saving" : "Save"}
                  </Button>
                  <Button variant="secondary" onClick={() => setSearching({ query: "", index: null })} disabled={busy}>
                    Add item
                  </Button>
                  <Button variant="text" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    Delete entry
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {searching && (
          <FoodSearch
            key={`${searching.index}-${searching.query}`}
            initialQuery={searching.query}
            unit={unit}
            allowManual={searching.index === null}
            cancelLabel="Back to this entry"
            onCancel={() => setSearching(null)}
            onPick={({ item, result }) => {
              const index = searching.index
              setItems(index !== null && result ? items.map((it, i) => (i === index ? changedFood(it, result) : it)) : [...items, item])
              setSearching(null)
            }}
          />
        )}
        {!searching && (
          <ul className="flex flex-col gap-3 pb-3">
            {items.map((item, index) => (
              <ItemRow
                key={index}
                item={item}
                unit={unit}
                onUnitChange={setUnit}
                onChange={(next) => setItems(items.map((it, i) => (i === index ? next : it)))}
                onRemove={() => {
                  const rest = items.filter((_, i) => i !== index)
                  if (rest.length) setItems(rest)
                  else setConfirmDelete(true)
                }}
                onChangeFood={() => setSearching({ query: item.name, index })}
              />
            ))}
          </ul>
        )}
      </CardSheet>
    </>
  )
}
