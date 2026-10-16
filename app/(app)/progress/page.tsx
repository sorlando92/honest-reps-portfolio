import { Suspense } from "react"
import type { Metadata } from "next"
import { getCurrentUser } from "@/core/auth/current-user"
import { localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/screen"
import { longDate, weekStart } from "@/modules/nutrition/days/week"
import { progressSummary } from "@/modules/nutrition/progress/summary"
import { ProgressDashboard } from "@/modules/nutrition/ui/progress/progress-dashboard"

export const metadata: Metadata = { title: "Progress" }

// Q60: the default range; the device's remembered choice reloads on open.
const DEFAULT_RANGE = 30

/** The dashboard (docs/PROGRESS_SPEC.md on top of docs/SCREENS_V2.md). */
export default function ProgressPage() {
  return (
    <main className="flex flex-col gap-3 py-4">
      <Suspense fallback={<EmptyState>Loading progress.</EmptyState>}>
        <Dashboard />
      </Suspense>
    </main>
  )
}

async function Dashboard() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const today = localToday(user.timezone)
  const summary = await progressSummary(supabase, user.id, weekStart(today), DEFAULT_RANGE)
  return (
    <>
      <header>
        <h1 className="text-title">Progress</h1>
        <p className="text-body text-text-muted">{longDate(summary.today)}</p>
      </header>
      <ProgressDashboard userId={user.id} initial={summary} own />
    </>
  )
}
