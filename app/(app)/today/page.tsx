import { Suspense } from "react"
import type { Metadata } from "next"
import { getCurrentUser } from "@/core/auth/current-user"
import { localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { EmptyState, Screen } from "@/components/screen"
import { dayEntries } from "@/modules/nutrition/entries/today"
import { TimelineRow } from "@/modules/nutrition/ui/timeline-row"
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
  const [{ data: profile }, { data: nutrition }] = await Promise.all([
    supabase.from("profiles").select("units, timezone").eq("id", user.id).single(),
    supabase.from("nutrition_profiles").select("has_scale").eq("user_id", user.id).maybeSingle(),
  ])
  const hasScale = (nutrition?.has_scale as boolean | null | undefined) ?? null
  const timezone = profile?.timezone ?? "UTC"
  const entries = await dayEntries(supabase, user.id, timezone, localToday(timezone))
  const units = profile?.units === "metric" ? "metric" : "imperial"

  return (
    <>
      {entries.length === 0 ? (
        <EmptyState>Nothing logged yet. Start with your last meal.</EmptyState>
      ) : (
        <ul aria-label="Today's entries" className="flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id}>
              <TimelineRow entry={e} units={units} hasScale={hasScale} />
            </li>
          ))}
        </ul>
      )}
      <LogFlow units={units} hasScale={hasScale} />
    </>
  )
}
