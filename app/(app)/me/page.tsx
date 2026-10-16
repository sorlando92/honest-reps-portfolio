import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { getCurrentUser } from "@/core/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import { currentTargets, userCalorieFloor } from "@/modules/nutrition/targets/current"
import { TargetsForm } from "./targets-form"
import { Screen } from "@/components/screen"
import { Button } from "@/components/ui/button"
import { signOut } from "./actions"

export const metadata: Metadata = { title: "Me" }

export default function MePage() {
  return (
    <Screen title="Me">
      <Suspense fallback={<div className="h-6" />}>
        <SignedInAs />
      </Suspense>
      <Suspense fallback={<div className="h-40" />}>
        <Targets />
      </Suspense>
      <section aria-labelledby="install" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
        <h2 id="install" className="text-label text-text-muted uppercase">
          Home Screen and reminders
        </h2>
        <Link href="/install?from=me" className="inline-flex min-h-11 items-center text-body text-accent-strong underline">
          Add to Home Screen and turn on reminders
        </Link>
      </section>
      <section aria-labelledby="about" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
        <h2 id="about" className="text-label text-text-muted uppercase">
          About
        </h2>
        <p className="text-body">
          Food data from{" "}
          <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent-strong underline">
            Open Food Facts
          </a>
        </p>
      </section>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </Screen>
  )
}

async function SignedInAs() {
  const user = await getCurrentUser()
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <span className="text-label text-text-muted uppercase">Signed in as</span>
      <span className="text-body break-all">{user.email}</span>
    </div>
  )
}

/** PRD F1: free users edit their own targets; paid clients see the coach's, read only. */
async function Targets() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const [{ data: profile }, targets, floor] = await Promise.all([
    supabase.from("profiles").select("tier").eq("id", user.id).single(),
    currentTargets(supabase, user.id),
    userCalorieFloor(supabase, user.id),
  ])
  const free = profile?.tier === "free"
  return (
    <section id="targets" aria-labelledby="targets-heading" className="flex scroll-mt-4 flex-col gap-3 rounded-lg bg-surface p-4">
      <h2 id="targets-heading" className="text-label text-text-muted uppercase">
        Targets
      </h2>
      {!targets ? (
        <p className="text-body text-text-muted">Your targets are set when you finish onboarding.</p>
      ) : free ? (
        <TargetsForm initial={targets} floor={floor} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {(
              [
                ["Calories", `${targets.calories.toLocaleString("en-US")} kcal`],
                ["Protein", `${targets.proteinG} g`],
                ["Carbs", `${targets.carbsG} g`],
                ["Fat", `${targets.fatG} g`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-label text-text-muted uppercase">{label}</dt>
                <dd className="text-headline tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-text-muted">{targets.setBy === "coach" ? "Set by your coach." : "Your coach will review these."}</p>
        </>
      )}
    </section>
  )
}
