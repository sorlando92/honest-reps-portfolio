import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import { KeyboardWatcher } from "@/components/nav/keyboard-watcher"
import { TabBar } from "@/components/nav/tab-bar"
import { TimezoneSync } from "@/core/time/timezone-sync"
import { mealWindows } from "@/modules/nutrition/entries/meals"
import "@/modules/nutrition"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    // NAV_SPEC 1: room for the floating tab bar so nothing hides behind it.
    <div className="pt-[env(safe-area-inset-top)] pb-[calc(var(--nav-clearance)+1rem)]">
      <div className="mx-auto w-full max-w-[720px] px-4">{children}</div>
      <KeyboardWatcher />
      {/* The session read streams in; until then the role-specific tab is an empty slot. */}
      <Suspense fallback={<TabBar isCoach={null} />}>
        <RoleAwareTabBar />
      </Suspense>
    </div>
  )
}

async function RoleAwareTabBar() {
  const user = await getCurrentUser()
  // PRD F1: nobody uses the app before onboarding sets their targets.
  if (!user.onboardingCompleted) redirect("/onboarding")
  const supabase = await createClient()
  const { data: windows } = await supabase.from("app_config").select("value").eq("key", "meal_windows").maybeSingle()
  return (
    <>
      <TabBar isCoach={user.role === "coach"} mealWindows={mealWindows(windows?.value)} />
      <TimezoneSync profileTimezone={user.timezone} />
    </>
  )
}
