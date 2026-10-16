"use client"

import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { rangeChangeKg, rangeChangeText, weightBounds } from "../../progress/chart"
import { WEIGHT_RANGES, type ProgressSummary, type WeightRange } from "../../progress/types"
import { formatWeight, toDisplay, unitLabel, type Units } from "../../weight/trend"

const W = 320
const H = 140

/**
 * Smoothed trend line, faint raw weigh-ins and the goal as a dashed line,
 * with a 7, 30, 90 day toggle (PROGRESS_SPEC 5).
 */
export function WeightTrend({
  weight,
  today,
  units,
  range,
  onRange,
  busy,
  onLogWeight,
}: {
  weight: ProgressSummary["weight"]
  today: string
  units: Units
  range: WeightRange
  onRange: (r: WeightRange) => void
  busy: boolean
  onLogWeight?: () => void
}) {
  const pts = weight.points
  const last = pts[pts.length - 1]
  const change = rangeChangeKg(weight)
  const unitWord = units === "metric" ? "kilograms" : "pounds"
  const summary = last
    ? `Trend ${toDisplay(last.trendKg, units).toFixed(1)} ${unitWord}${change === null ? "" : `, ${rangeChangeText(change, units, range).toLowerCase().replace(/ (lb|kg) /, " ")}`}.`
    : "No weigh-ins in this range."

  return (
    <section aria-labelledby="weight-trend" className={cn("flex flex-col gap-3 rounded-lg bg-surface p-4 transition-opacity", busy && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="weight-trend" className="text-headline">
          Weight trend
        </h2>
        <div role="group" aria-label="Range" className="flex rounded-full bg-bg p-0.5">
          {WEIGHT_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              aria-label={`${r} days`}
              onClick={() => r !== range && onRange(r)}
              className={cn("flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-label tabular-nums", r === range ? "bg-accent text-on-accent" : "text-text-muted")}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {last && (
        <div>
          <p className="text-number-lg font-bold tabular-nums">Trend {formatWeight(last.trendKg, units)}</p>
          {change !== null && <p className="text-caption text-text-muted">{rangeChangeText(change, units, range)}</p>}
        </div>
      )}
      <div role="img" aria-label={summary}>
        {pts.length >= 2 ? <Chart weight={weight} today={today} units={units} range={range} /> : <Sparse weight={weight} units={units} />}
      </div>
      {onLogWeight && (
        <Button variant="secondary" onClick={onLogWeight}>
          Log weight
        </Button>
      )}
    </section>
  )
}

function x(date: string, today: string, range: number): number {
  const [y1, m1, d1] = date.split("-").map(Number)
  const [y2, m2, d2] = today.split("-").map(Number)
  const ago = (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  return W - (ago / Math.max(1, range - 1)) * W
}

function Chart({ weight, today, units, range }: { weight: ProgressSummary["weight"]; today: string; units: Units; range: number }) {
  const values = weight.points.flatMap((p) => [p.kg, p.trendKg]).concat(weight.goalKg !== null ? [weight.goalKg] : [])
  const [lo, hi] = weightBounds(values, units)
  const y = (kg: number) => H - ((kg - lo) / (hi - lo)) * H
  const line = weight.points.map((p, i) => `${i ? "L" : "M"}${x(p.date, today, range).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="h-auto w-full" aria-hidden>
      {weight.goalKg !== null && (
        <line x1={0} x2={W} y1={y(weight.goalKg)} y2={y(weight.goalKg)} strokeDasharray="4 4" className="stroke-text-muted" strokeWidth={1} />
      )}
      {weight.points.map((p) => (
        <circle key={p.date} cx={x(p.date, today, range)} cy={y(p.kg)} r={2.5} className="fill-text-muted" fillOpacity={0.4} />
      ))}
      <path d={line} fill="none" className="stroke-text" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <text x={W} y={8} textAnchor="end" className="fill-text-muted text-[10px]">
        {toDisplay(hi, units).toFixed(0)} {unitLabel(units)}
      </text>
      <text x={W} y={H - 2} textAnchor="end" className="fill-text-muted text-[10px]">
        {toDisplay(lo, units).toFixed(0)} {unitLabel(units)}
      </text>
    </svg>
  )
}

function Sparse({ weight, units }: { weight: ProgressSummary["weight"]; units: Units }) {
  return (
    <div className="flex flex-col gap-2">
      {weight.points.length === 1 && (
        <p className="flex items-center gap-2 text-body tabular-nums">
          <span aria-hidden className="size-2 rounded-full bg-text-muted" />
          {formatWeight(weight.points[0].kg, units)}
        </p>
      )}
      <p className="text-body text-text-muted">Log a few more weigh-ins to see your trend.</p>
    </div>
  )
}
