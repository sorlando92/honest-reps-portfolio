import { Suspense } from "react"
import type { Metadata } from "next"
import { getCurrentUser } from "@/core/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import { EmptyState, Screen } from "@/components/screen"
import { todayEntries } from "@/modules/nutrition/entries/today"
import { LogFlow } from "@/modules/nutrition/ui/log-flow"

export const metadata: Metadata = { title: "Today" }

export default function TodayPage() {
  return (
    // Room for the log bar pinned above the tab bar.
    <div className="pb-20">
      <Screen title="Today">
        <Suspense fallback={<EmptyState>Loading today.</EmptyState>}>
          <Timeline />
        </Suspense>
      </Screen>
    </div>
  )
}

async function Timeline() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const { data: profile } = await supabase.from("profiles").select("units, timezone").eq("id", user.id).single()
  const entries = await todayEntries(supabase, user.id, profile?.timezone ?? "UTC")
  const units = profile?.units === "metric" ? "metric" : "imperial"

  return (
    <>
      {entries.length === 0 ? (
        <EmptyState>Nothing logged yet. Start with your last meal.</EmptyState>
      ) : (
        <ul aria-label="Today's entries" className="flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex min-h-11 items-baseline gap-3 py-3">
              <span className="w-16 shrink-0 text-caption text-text-muted tabular-nums">{e.time}</span>
              <span className="min-w-0 flex-1 text-body break-words">
                {e.names}
                {e.marker === "amount" && <span className="ml-2 text-caption text-text-muted">est.</span>}
                {e.marker === "match" && (
                  <span className="ml-2 inline-flex items-center gap-1 text-caption">
                    <span aria-hidden className="size-1.5 rounded-full bg-caution" />
                    Check this
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-body tabular-nums">
                {e.calories} <span className="text-caption text-text-muted">cal</span>
                <span className="block text-caption text-text-muted">{e.proteinG} g protein</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <LogFlow units={units} />
    </>
  )
}
