import { formatNumber } from "../../days/week"
import type { WeekAverages as Averages } from "../../progress/types"

/**
 * Five compact stats for the week in the chart, over logged days only
 * (PROGRESS_SPEC 3). On target stats are hidden before targets exist (Q59).
 */
export function WeekAverages({ averages: a }: { averages: Averages }) {
  if (a.loggedDays === 0) {
    return <p className="rounded-lg bg-surface p-4 text-body text-text-muted">No logs this week yet.</p>
  }
  const stats: [string, string][] = [
    ["Avg calories", formatNumber(a.avgCalories ?? 0)],
    ["Avg protein", `${formatNumber(a.avgProteinG ?? 0)} g`],
  ]
  if (a.daysOnTarget !== null) stats.push(["Days on target", `${a.daysOnTarget} of ${a.elapsedDays}`])
  if (a.proteinDays !== null) stats.push(["Protein days", `${a.proteinDays} of ${a.elapsedDays}`])
  stats.push(["Weighed", a.weighedShare === null ? "0%" : `${Math.round(a.weighedShare * 100)}%`])
  return (
    <section aria-label="Week averages" className="rounded-lg bg-surface p-4">
      <dl className="grid grid-cols-3 gap-x-2 gap-y-3">
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-label text-text-muted uppercase">{label}</dt>
            <dd className="text-headline tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
