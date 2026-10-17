"use client"

import { useEffect, useId, useRef, useState } from "react"
import { NOTE_FOCUS_EVENT } from "./today-events"

/**
 * One note per local day at the end of Today, saved on blur with a quiet
 * "Saved." (docs/SCREENS_V2.md Today 8). Visible to the user and their coach.
 */
export function DayNote({ date, initial }: { date: string; initial: string }) {
  const id = useId()
  const [value, setValue] = useState(initial)
  const saved = useRef(initial)
  const [status, setStatus] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)

  // "+" Day note and the header menu (NAV_SPEC 2, 4).
  useEffect(() => {
    const onFocus = () => {
      const el = field.current
      if (!el) return
      el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
      el.focus({ preventScroll: true })
    }
    window.addEventListener(NOTE_FOCUS_EVENT, onFocus)
    return () => window.removeEventListener(NOTE_FOCUS_EVENT, onFocus)
  }, [])

  async function save() {
    const text = value.trim()
    if (text === saved.current.trim()) return
    setStatus("")
    const res = await fetch("/api/day-notes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, body: text }),
    }).catch(() => null)
    if (!res?.ok) {
      setStatus("Not saved. Try again.")
      return
    }
    saved.current = text
    setStatus("Saved.")
  }

  return (
    <section className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        Note for this day
      </label>
      <textarea
        ref={field}
        id={id}
        value={value}
        maxLength={1000}
        rows={3}
        placeholder="Add a note"
        onChange={(e) => {
          setValue(e.target.value)
          setStatus("")
        }}
        onBlur={save}
        className="min-h-24 resize-none rounded-lg border border-border bg-surface p-3 text-body placeholder:text-text-muted"
      />
      <p role="status" aria-live="polite" className="min-h-4 text-caption text-text-muted">
        {status}
      </p>
    </section>
  )
}
