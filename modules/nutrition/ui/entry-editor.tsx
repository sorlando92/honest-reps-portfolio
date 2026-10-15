"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import type { DraftItem } from "../parsing/service"
import { totals, type WeightUnit } from "./amounts"
import { CardSheet } from "./card-sheet"
import { ItemRow } from "./item-row"
import { toEntryItem } from "./entry-items"

/**
 * Edit and delete for a logged entry (PRD F2). Opens the same card as a new
 * meal. Saving is the user confirming the entry, so its flags clear.
 */
export function EntryEditor({ entryId, title, items: saved, units }: { entryId: string; title: string; items: DraftItem[]; units: "imperial" | "metric" }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(saved)
  const [unit, setUnit] = useState<WeightUnit>(units === "metric" ? "g" : "oz")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  function openEditor() {
    setItems(saved)
    setConfirmDelete(false)
    setError(null)
    setOpen(true)
  }

  function send(method: "PATCH" | "DELETE") {
    setError(null)
    start(async () => {
      const res = await fetch(`/api/entries/${entryId}`, {
        method,
        headers: method === "PATCH" ? { "content-type": "application/json" } : undefined,
        body: method === "PATCH" ? JSON.stringify({ items: items.map((i) => toEntryItem({ ...i, flagReason: null }, null)) }) : undefined,
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
      <Button variant="text" onClick={openEditor} aria-label={`Edit ${title}`} className="h-11 min-w-11 justify-start px-0 text-accent-strong">
        Edit
      </Button>
      <CardSheet
        open={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title="Edit entry"
        summary={`${sum.calories} cal · ${sum.proteinG} g protein`}
        footer={
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
                <Button variant="text" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Delete entry
                </Button>
              </>
            )}
          </>
        }
      >
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
            />
          ))}
        </ul>
      </CardSheet>
    </>
  )
}
