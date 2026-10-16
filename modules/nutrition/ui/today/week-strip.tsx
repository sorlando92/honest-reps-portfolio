"use client"

import { useRef } from "react"
import { cn } from "cn"
import { addDays } from "@/core/time/local-day"
import { fill, formatNumber, longDate, weekdayLetter, type DayTotals } from "../../days/week"
import { Ring } from "./macro-ring"
import { useGoToDay } from "./day-nav"

// A deliberate horizontal swipe, not a scroll.
const SWIPE_PX = 50

/**
 * Monday to Sunday, each date inside a ring filled to calories over target
 * (docs/SCREENS_V2.md Today 2). Before targets the ring is only its track
 * (Q59). Swipe moves a week; the header arrows do the same for keyboards.
 */
export function WeekStrip({ days, date, today }: { days: DayTotals[]; date: string; today: string }) {
  const go = useGoToDay(today, date)
  const start = useRef<{ x: number; y: number } | null>(null)

  return (
    <nav
      aria-label="Week"
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = start.current
        start.current = null
        if (!s) return
        const dx = e.changedTouches[0].clientX - s.x
        const dy = e.changedTouches[0].clientY - s.y
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx)) return
        const target = addDays(date, dx > 0 ? -7 : 7)
        go(target > today ? today : target)
      }}
    >
      <ul className="grid grid-cols-7">
        {days.map((d) => {
          const future = d.date > today
          const selected = d.date === date
          const label = `${longDate(d.date)}${
            future ? "" : d.target ? `, ${formatNumber(d.calories)} of ${formatNumber(d.target.calories)} calories` : `, ${formatNumber(d.calories)} calories`
          }`
          return (
            <li key={d.date} className="flex justify-center">
              <button
                type="button"
                disabled={future}
                aria-label={label}
                aria-current={selected ? "date" : undefined}
                onClick={() => go(d.date)}
                className={cn(
                  "flex min-h-11 min-w-11 flex-col items-center gap-0.5 rounded-md border px-1 py-1 disabled:opacity-40",
                  selected ? "border-text" : "border-transparent"
                )}
              >
                <span aria-hidden className="text-label text-text-muted">
                  {weekdayLetter(d.date)}
                </span>
                <span aria-hidden className="relative flex items-center justify-center">
                  <Ring macro="calories" value={future ? 0 : fill(d.calories, d.target?.calories)} size={34} stroke={3} />
                  <span className="absolute text-caption font-semibold tabular-nums">{Number(d.date.slice(8))}</span>
                </span>
                <span aria-hidden className={cn("size-1 rounded-full", d.date === today ? "bg-text" : "bg-transparent")} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
