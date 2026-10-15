"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { DraftItem } from "../parsing/service"
import { EntryEditor } from "./entry-editor"

export interface TimelineRowEntry {
  id: string
  time: string
  title: string
  items: DraftItem[]
  calories: number
  proteinG: number
  marker: "match" | "estimated" | null
}

// A deliberate horizontal swipe, not a scroll.
const SWIPE_PX = 60
const SWIPE_SLOPE = 0.6

/**
 * One timeline entry (DESIGN_SYSTEM.md "Entry row"): titled with what the
 * user typed, tap to see its items, swipe left or tap Edit to change or
 * delete it. The Edit button is the path for keyboards and screen readers.
 */
export function TimelineRow({ entry: e, units }: { entry: TimelineRowEntry; units: "imperial" | "metric" }) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  function edit() {
    setSession((n) => n + 1)
    setOpen(true)
  }

  return (
    <>
      <details>
        <summary
          onTouchStart={(t) => {
            start.current = { x: t.touches[0].clientX, y: t.touches[0].clientY }
            swiped.current = false
          }}
          onTouchEnd={(t) => {
            const from = start.current
            start.current = null
            if (!from) return
            const dx = t.changedTouches[0].clientX - from.x
            const dy = Math.abs(t.changedTouches[0].clientY - from.y)
            if (dx < -SWIPE_PX && dy < Math.abs(dx) * SWIPE_SLOPE) {
              swiped.current = true
              edit()
            }
          }}
          onClick={(c) => {
            // A swipe opens the editor; it should not also open the row.
            if (swiped.current) {
              c.preventDefault()
              swiped.current = false
            }
          }}
          className="flex min-h-11 cursor-pointer list-none items-baseline gap-3 py-3 [&::-webkit-details-marker]:hidden"
        >
          <span className="w-16 shrink-0 text-caption text-text-muted tabular-nums">{e.time}</span>
          <span className="flex min-w-0 flex-1 items-baseline">
            <span className="truncate text-body">{e.title}</span>
            {e.marker === "estimated" && <span className="ml-2 shrink-0 text-caption text-text-muted">est.</span>}
            {e.marker === "match" && (
              <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-caption">
                <span aria-hidden className="size-1.5 rounded-full bg-caution" />
                Check this
              </span>
            )}
          </span>
          <span className="shrink-0 text-right text-body tabular-nums">
            {e.calories} <span className="text-caption text-text-muted">cal</span>
            <span className="block text-caption text-text-muted">{e.proteinG} g protein</span>
          </span>
        </summary>
        <ul aria-label="Items" className="mb-3 ml-19 flex flex-col gap-1">
          {e.items.map((item, i) => (
            <li key={i} className="flex items-baseline gap-3 text-caption text-text-muted">
              <span className="min-w-0 flex-1 break-words">{item.name}</span>
              <span className="shrink-0 tabular-nums">
                {Math.round(item.calories)} cal, {Math.round(item.proteinG)} g protein
              </span>
            </li>
          ))}
        </ul>
        <div className="mb-2 ml-19">
          <Button variant="text" onClick={edit} aria-label={`Edit ${e.title}`} className="h-11 min-w-11 justify-start px-0 text-accent-strong">
            Edit
          </Button>
        </div>
      </details>
      <EntryEditor key={session} entryId={e.id} items={e.items} units={units} open={open} onOpenChange={setOpen} />
    </>
  )
}
