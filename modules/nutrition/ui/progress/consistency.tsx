"use client"

import { cn } from "cn"
import type { ConsistencyDay } from "../../progress/types"

/**
 * Two 10 by 3 grids of the last 30 local days, oldest top left, today bottom
 * right with an outline (PROGRESS_SPEC 4). Cells are not focusable; each card
 * has one summary label. Food log cells open Today on that date when
 * `onOpenDay` is given.
 */
export function Consistency({ days, today, onOpenDay }: { days: ConsistencyDay[]; today: string; onOpenDay?: (date: string) => void }) {
  const logged = days.filter((d) => d.logged).length
  const onTarget = days.filter((d) => d.adherent).length
  const weighed = days.filter((d) => d.weighed).length
  return (
    <section aria-label="Consistency, 30 days" className="grid grid-cols-2 gap-3">
      <Card
        title="Food log"
        caption={logged ? `${logged} of 30 days logged` : "No logs yet"}
        label={`${logged} of 30 days logged, ${onTarget} on target.`}
      >
        {days.map((d) => (
          <Cell
            key={d.date}
            today={d.date === today}
            className={d.adherent ? "bg-accent-strong" : d.logged ? "bg-border" : "border border-border"}
            onClick={onOpenDay ? () => onOpenDay(d.date) : undefined}
          />
        ))}
      </Card>
      <Card title="Weigh-ins" caption={weighed ? `${weighed} weigh-ins` : "No weigh-ins yet"} label={`${weighed} weigh-ins in 30 days.`}>
        {days.map((d) => (
          <Cell key={d.date} today={d.date === today} className={d.weighed ? "bg-text" : "border border-border"} />
        ))}
      </Card>
    </section>
  )
}

function Card({ title, caption, label, children }: { title: string; caption: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <h3 className="text-label text-text-muted uppercase">{title}</h3>
      <div role="img" aria-label={label} className="grid grid-cols-10 gap-0.5">
        {children}
      </div>
      <p aria-hidden className="text-caption text-text-muted tabular-nums">
        {caption}
      </p>
    </div>
  )
}

function Cell({ today, className, onClick }: { today: boolean; className: string; onClick?: () => void }) {
  return (
    <span
      aria-hidden
      onClick={onClick}
      className={cn("aspect-square rounded-[2px]", className, today && "outline-2 outline-offset-1 outline-text", onClick && "cursor-pointer")}
    />
  )
}
