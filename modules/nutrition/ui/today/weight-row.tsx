"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CardSheet } from "../card-sheet"
import { shortDate } from "../../days/week"
import { formatWeight, toDisplay, unitLabel, type Units } from "../../weight/trend"

/**
 * "Weight" with the day's weigh-in or "Log weight", and the trend line
 * (DESIGN_SYSTEM.md "Weight row"). Opens the weight sheet: entry for the
 * selected day plus the last 7 days.
 */
export function WeightRow({
  date,
  isToday,
  weighInKg,
  trend,
  last7,
  units,
}: {
  date: string
  isToday: boolean
  weighInKg: number | null
  /** "Trend 182.4 lb, down 0.6 this week", or null before any weigh-in. */
  trend: string | null
  last7: { date: string; kg: number | null }[]
  units: Units
}) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby="weight-heading" className="flex min-h-11 items-center gap-3 rounded-lg bg-surface px-4 py-3">
      <div className="flex flex-1 flex-col">
        <h2 id="weight-heading" className="text-label text-text-muted uppercase">
          Weight
        </h2>
        {weighInKg !== null && <p className="text-headline tabular-nums">{formatWeight(weighInKg, units)}</p>}
        {trend && <p className="text-caption text-text-muted tabular-nums">{trend}</p>}
      </div>
      <Button variant={weighInKg === null ? "secondary" : "text"} className="h-11 px-4" onClick={() => setOpen(true)}>
        {weighInKg === null ? "Log weight" : "Edit"}
      </Button>
      {open && <WeightSheet open={open} onOpenChange={setOpen} date={date} isToday={isToday} weighInKg={weighInKg} last7={last7} units={units} />}
    </section>
  )
}

/** Weight entry for a local day plus the last 7 days; shared by Today and Progress. */
export function WeightSheet({
  open,
  onOpenChange,
  date,
  isToday,
  weighInKg,
  last7,
  units,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  date: string
  isToday: boolean
  weighInKg: number | null
  last7: { date: string; kg: number | null }[]
  units: Units
  /** Called after a save; Today refreshes the page by default. */
  onSaved?: () => void
}) {
  const id = useId()
  const router = useRouter()
  const [value, setValue] = useState(weighInKg === null ? "" : toDisplay(weighInKg, units).toFixed(1))
  const [error, setError] = useState<string | null>(null)
  const [saving, start] = useTransition()
  const number = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(number) && number > 0

  function save() {
    setError(null)
    start(async () => {
      const res = await fetch("/api/weights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, weight: number }),
      }).catch(() => null)
      if (!res?.ok) {
        setError(res?.status === 400 ? "Check the weight and try again." : "Not saved. Try again.")
        return
      }
      navigator.vibrate?.(10)
      onOpenChange(false)
      if (onSaved) onSaved()
      else router.refresh()
    })
  }

  return (
    <CardSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Weight"
      summary={isToday ? "Today" : shortDate(date)}
      footer={
        <>
          {error && (
            <p role="alert" className="text-body text-caution">
              {error}
            </p>
          )}
          <Button onClick={save} disabled={!valid || saving}>
            {saving ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-2 pb-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save()
        }}
      >
        <label htmlFor={id} className="text-label text-text-muted uppercase">
          Weight in {unitLabel(units)}
        </label>
        <input
          id={id}
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(",", "."))}
          className="h-12 rounded-md border border-border bg-surface px-3 text-body tabular-nums"
        />
      </form>
      <h3 className="text-label text-text-muted uppercase">Last 7 days</h3>
      <ul className="flex flex-col divide-y divide-border pb-4">
        {last7.map((d) => (
          <li key={d.date} className="flex min-h-11 items-center justify-between text-body tabular-nums">
            <span>{shortDate(d.date)}</span>
            <span className={d.kg === null ? "text-text-muted" : undefined}>{d.kg === null ? "No weigh-in" : formatWeight(d.kg, units)}</span>
          </li>
        ))}
      </ul>
    </CardSheet>
  )
}
