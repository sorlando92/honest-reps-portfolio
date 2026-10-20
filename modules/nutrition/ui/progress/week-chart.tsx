"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { formatNumber, longDate, type DayTotals } from "../../days/week"
import { barSegments, gridlines, weekLabel, yMax } from "../../progress/chart"
import type { WeekAverages } from "../../progress/types"
import { MACRO_DOT, MACRO_LABEL, MACRO_TEXT, type Macro } from "../today/macros"

const SWIPE_PX = 50
const LONG_PRESS_MS = 500
const TILES: Macro[] = ["protein", "carbs", "fat", "calories"]

/** "Tuesday, 1,980 of 2,100 calories, protein 160 of 158 grams." */
function barLabel(d: DayTotals, today: string): string {
  if (d.date > today) return `${longDate(d.date)}, coming up.`
  if (!d.logged) return `${longDate(d.date)}, not logged.`
  const cal = d.target ? `${formatNumber(d.calories)} of ${formatNumber(d.target.calories)} calories` : `${formatNumber(d.calories)} calories`
  const protein = d.target ? `protein ${formatNumber(d.proteinG)} of ${formatNumber(d.target.proteinG)} grams` : `protein ${formatNumber(d.proteinG)} grams`
  return `${longDate(d.date)}, ${cal}, ${protein}.`
}

/** "This week: average 2,040 calories, 4 of 6 days on target, protein 5 of 6." */
function chartSummary(label: string, a: WeekAverages): string {
  if (a.loggedDays === 0) return `${label}: no logs yet.`
  const parts = [`average ${formatNumber(a.avgCalories ?? 0)} calories`]
  if (a.daysOnTarget !== null) parts.push(`${a.daysOnTarget} of ${a.elapsedDays} days on target`)
  if (a.proteinDays !== null) parts.push(`protein ${a.proteinDays} of ${a.elapsedDays}`)
  return `${label}: ${parts.join(", ")}.`
}

/**
 * 7 stacked macro bars with each day's target line, chevrons and swipe for
 * weeks, a selected day and its 4 tiles (PROGRESS_SPEC 2). Long press or
 * double tap a bar opens that day when `onOpenDay` is given.
 */
export function WeekChart({
  week,
  weekStart,
  today,
  averages,
  selected,
  onSelect,
  onWeek,
  canGoNext,
  busy,
  onOpenDay,
}: {
  week: DayTotals[]
  weekStart: string
  today: string
  averages: WeekAverages
  selected: string
  onSelect: (date: string) => void
  onWeek: (delta: -1 | 1) => void
  canGoNext: boolean
  busy: boolean
  onOpenDay?: (date: string) => void
}) {
  const label = weekLabel(weekStart, today, week[6]?.date ?? weekStart)
  const max = yMax(week)
  const lines = gridlines(max)
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null)
  const day = week.find((d) => d.date === selected) ?? week[week.length - 1]

  function startPress(date: string) {
    if (!onOpenDay || date > today) return
    const state = { fired: false, timer: setTimeout(() => {
      state.fired = true
      onOpenDay(date)
    }, LONG_PRESS_MS) }
    press.current = state
  }
  function endPress() {
    if (press.current) clearTimeout(press.current.timer)
  }

  return (
    <section aria-labelledby="week-label" className="flex flex-col gap-3 rounded-lg bg-surface px-3 py-4">
      <div className="flex items-center">
        <Button variant="text" size="icon" aria-label="Previous week" onClick={() => onWeek(-1)} disabled={busy}>
          <ChevronLeft aria-hidden />
        </Button>
        <h2 id="week-label" className="flex-1 text-center text-headline" aria-live="polite">
          {label}
        </h2>
        <Button variant="text" size="icon" aria-label="Next week" onClick={() => onWeek(1)} disabled={busy || !canGoNext}>
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <p className="sr-only">{chartSummary(label, averages)}</p>

      <div
        className={cn("relative flex h-44 gap-px pt-3 transition-opacity", busy && "opacity-60")}
        onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = swipe.current
          swipe.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x
          if (Math.abs(dx) < SWIPE_PX || Math.abs(e.changedTouches[0].clientY - s.y) > Math.abs(dx)) return
          if (dx > 0) onWeek(-1)
          else if (canGoNext) onWeek(1)
        }}
      >
        {lines.map((v) => (
          <div key={v} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-border" style={{ bottom: pct(v) }}>
            <span className="absolute -top-4 left-0 z-10 rounded-sm bg-surface/80 px-0.5 text-caption leading-none text-text-muted tabular-nums">{formatNumber(v)}</span>
          </div>
        ))}
        {week.map((d) => {
          const future = d.date > today
          const s = barSegments(d)
          const isSelected = d.date === selected
          return (
            <button
              key={d.date}
              type="button"
              disabled={future}
              aria-label={barLabel(d, today)}
              aria-pressed={isSelected}
              onClick={() => {
                if (press.current?.fired) return
                onSelect(d.date)
              }}
              onDoubleClick={() => onOpenDay?.(d.date)}
              onPointerDown={() => startPress(d.date)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onContextMenu={(e) => onOpenDay && e.preventDefault()}
              className={cn(
                "relative flex min-w-11 flex-1 flex-col items-center justify-end rounded-sm select-none [-webkit-touch-callout:none]",
                isSelected ? "opacity-100" : "opacity-50"
              )}
            >
              {d.logged ? (
                <span className="flex w-3/5 flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: pct(d.calories) }}>
                  {(["protein", "carbs", "fat"] as const).map((m) => (
                    <span key={m} className={cn("w-full", MACRO_DOT[m])} style={{ flexGrow: s[m] }} />
                  ))}
                  {s.other > 0 && <span className="w-full bg-border" style={{ flexGrow: s.other }} />}
                </span>
              ) : (
                !future && <span aria-hidden className="mb-0.5 size-1.5 rounded-full bg-text-muted" />
              )}
              {d.target && !future && (
                <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-text-muted" style={{ bottom: pct(d.target.calories) }} />
              )}
            </button>
          )
        })}
      </div>
      <div aria-hidden className="flex gap-px text-center text-caption text-text-muted">
        {week.map((d) => (
          <span key={d.date} className={cn("min-w-11 flex-1", d.date === selected && "font-semibold text-text")}>
            {longDate(d.date).charAt(0)}
          </span>
        ))}
      </div>

      <ul aria-label={`${longDate(day.date)} totals`} className="grid grid-cols-2 gap-2">
        {TILES.map((m) => {
          const eaten = m === "protein" ? day.proteinG : m === "carbs" ? day.carbsG : m === "fat" ? day.fatG : day.calories
          const target = day.target ? (m === "protein" ? day.target.proteinG : m === "carbs" ? day.target.carbsG : m === "fat" ? day.target.fatG : day.target.calories) : null
          const unit = m === "calories" ? "" : " g"
          return (
            <li key={m} className="flex flex-col gap-0.5 rounded-md bg-bg px-3 py-2">
              <span className="flex items-center gap-1.5 text-label text-text-muted uppercase">
                <span aria-hidden className={cn("size-2 rounded-full", MACRO_DOT[m])} />
                {MACRO_LABEL[m]}
              </span>
              <span className={cn("text-headline tabular-nums", MACRO_TEXT[m])}>
                {target === null ? `${formatNumber(eaten)}${unit}` : `${formatNumber(eaten)} of ${formatNumber(target)}`}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
