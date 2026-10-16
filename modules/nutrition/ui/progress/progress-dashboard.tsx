"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { track } from "@/core/events/client"
import { addDays } from "@/core/time/local-day"
import { daysBetween, weekStart as mondayOf } from "../../days/week"
import { defaultSelected } from "../../progress/chart"
import { isWeightRange, type ProgressSummary, type WeightRange } from "../../progress/types"
import { WeightSheet } from "../today/weight-row"
import { Consistency } from "./consistency"
import { WeekAverages } from "./week-averages"
import { WeekChart } from "./week-chart"
import { WeightTrend } from "./weight-trend"

const RANGE_KEY = "hr:weight-range"

function storedRange(): WeightRange | null {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY))
    return isWeightRange(n) ? n : null
  } catch {
    return null
  }
}

/**
 * The Progress dashboard for one user (docs/PROGRESS_SPEC.md): week chart
 * and tiles, week averages, 30 day consistency, weight trend. Takes the
 * user id so the coach client week view (step 5) can reuse it; `own` turns
 * on what only the user does (open a day on Today, log weight).
 */
export function ProgressDashboard({ userId, initial, own }: { userId: string; initial: ProgressSummary; own: boolean }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [range, setRange] = useState<WeightRange>(initial.weight.rangeDays)
  const [selected, setSelected] = useState(() => defaultSelected(initial.weekStart, initial.week, initial.today))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weighing, setWeighing] = useState(false)
  const request = useRef(0)
  const currentWeek = mondayOf(data.today)

  async function load(week: string, r: WeightRange): Promise<ProgressSummary | null> {
    const id = ++request.current
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/progress?user=${userId}&week=${week}&range=${r}`).catch(() => null)
    if (id !== request.current) return null
    setBusy(false)
    if (!res?.ok) {
      setError("Could not load. Check your connection and try again.")
      return null
    }
    const next = (await res.json()) as ProgressSummary
    setData(next)
    return next
  }

  // progress_viewed once; the range remembered on this device (Q60).
  useEffect(() => {
    if (own) track("progress_viewed")
    const stored = storedRange()
    if (stored && stored !== initial.weight.rangeDays) {
      void Promise.resolve().then(() => {
        setRange(stored)
        return load(initial.weekStart, stored)
      })
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function changeWeek(delta: -1 | 1) {
    const week = addDays(data.weekStart, delta * 7)
    if (week > currentWeek) return
    const next = await load(week, range)
    if (!next) return
    setSelected(defaultSelected(week, next.week, next.today))
    if (own) track("progress_week_changed", { weeks_from_current: Math.round(daysBetween(currentWeek, week) / 7) })
  }

  async function changeRange(r: WeightRange) {
    setRange(r)
    try {
      localStorage.setItem(RANGE_KEY, String(r))
    } catch {}
    if (own) track("weight_range_changed", { days: r })
    await load(data.weekStart, r)
  }

  const openDay = own ? (date: string) => router.push(date === data.today ? "/today" : `/today?date=${date}`) : undefined
  const todayKg = data.weight.points.find((p) => p.date === data.today)?.kg ?? null
  const byDate = new Map(data.weight.points.map((p) => [p.date, p.kg]))

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-body text-caution">
          {error}
        </p>
      )}
      <WeekChart
        week={data.week}
        weekStart={data.weekStart}
        today={data.today}
        averages={data.averages}
        selected={selected}
        onSelect={setSelected}
        onWeek={changeWeek}
        canGoNext={data.weekStart < currentWeek}
        busy={busy}
        onOpenDay={openDay}
      />
      <WeekAverages averages={data.averages} />
      <Consistency days={data.days30} today={data.today} onOpenDay={openDay} />
      <WeightTrend
        weight={data.weight}
        today={data.today}
        units={data.units}
        range={range}
        onRange={changeRange}
        busy={busy}
        onLogWeight={own ? () => setWeighing(true) : undefined}
      />
      {weighing && (
        <WeightSheet
          open={weighing}
          onOpenChange={setWeighing}
          date={data.today}
          isToday
          weighInKg={todayKg}
          last7={Array.from({ length: 7 }, (_, i) => addDays(data.today, -i)).map((d) => ({ date: d, kg: byDate.get(d) ?? null }))}
          units={data.units}
          onSaved={() => void load(data.weekStart, range)}
        />
      )}
    </div>
  )
}
