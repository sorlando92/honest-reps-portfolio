import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { getCurrentUser } from "@/core/auth/current-user"
import { localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/screen"
import { longDate, weekStart } from "@/modules/nutrition/days/week"
import { mealAnchors, mealWindows } from "@/modules/nutrition/entries/meals"
import { quickAddChips } from "@/modules/nutrition/entries/quick-add"
import { progressSummary } from "@/modules/nutrition/progress/summary"
import { LogFlow } from "@/modules/nutrition/ui/log-flow"
import { ProgressDashboard } from "@/modules/nutrition/ui/progress/progress-dashboard"

export const metadata: Metadata = { title: "Progress" }

// Q60: the default range; the device's remembered choice reloads on open.
const DEFAULT_RANGE = 30

/** The dashboard (docs/PROGRESS_SPEC.md on top of docs/SCREENS_V2.md; header per NAV_SPEC 5). */
export default function ProgressPage() {
  return (
    // Room for the log bar floating above the tab bar.
    <main className="flex flex-col gap-3 pt-4 pb-20">
      <Suspense fallback={<EmptyState>Loading progress.</EmptyState>}>
        <Dashboard />
      </Suspense>
    </main>
  )
}

/** Q63: the first word of the display name, else none. */
function firstName(displayName: string | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}

async function Dashboard() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const today = localToday(user.timezone)
  const [summary, { data: profile }, { data: nutrition }, { data: config }, chips] = await Promise.all([
    progressSummary(supabase, user.id, weekStart(today), DEFAULT_RANGE),
    supabase.from("profiles").select("display_name, units").eq("id", user.id).single(),
    supabase.from("nutrition_profiles").select("has_scale").eq("user_id", user.id).maybeSingle(),
    supabase.from("app_config").select("key, value").in("key", ["meal_windows", "meal_anchors"]),
    quickAddChips(supabase, user.id, user.timezone),
  ])
  const setting = (key: string) => config?.find((c) => c.key === key)?.value
  const name = firstName((profile?.display_name as string | null) ?? null)
  const initial = (name ?? user.email ?? "?").charAt(0).toUpperCase()

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-title">{name ? `Hi, ${name}` : "Hi"}</h1>
          <p className="text-body text-text-muted">{longDate(summary.today)}</p>
        </div>
        <Link href="/more" aria-label="More" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-headline">
          <span aria-hidden>{initial}</span>
        </Link>
      </header>
      <ProgressDashboard userId={user.id} initial={summary} own />
      {/* NAV_SPEC 3: logs from Progress go to today, then the app switches to Today. */}
      <LogFlow
        units={profile?.units === "metric" ? "metric" : "imperial"}
        hasScale={(nutrition?.has_scale as boolean | null | undefined) ?? null}
        chips={chips}
        timezone={user.timezone}
        mealWindows={mealWindows(setting("meal_windows"))}
        mealAnchors={mealAnchors(setting("meal_anchors"))}
        date={today}
        afterLog="today"
      />
    </>
  )
}
