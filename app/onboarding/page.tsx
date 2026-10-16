import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveTargetDefaults } from "@/modules/nutrition/targets/defaults"
import { OnboardingFlow } from "./onboarding-flow"

export const metadata: Metadata = { title: "Welcome" }

/** PRD F1 onboarding. Finished users go straight to Today. */
export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
    </main>
  )
}

async function Onboarding() {
  const user = await getCurrentUser()
  if (user.onboardingCompleted) redirect("/today")
  const supabase = await createClient()
  const [{ data: profile }, resolved] = await Promise.all([
    supabase.from("profiles").select("units").eq("id", user.id).single(),
    // The same settings the save uses, so the preview matches what is saved.
    resolveTargetDefaults(createAdminClient(), user.id),
  ])

  return (
    <OnboardingFlow
      initialUnits={profile?.units === "metric" ? "metric" : "imperial"}
      today={localToday(user.timezone)}
      targetDefaults={resolved?.defaults ?? null}
    />
  )
}
