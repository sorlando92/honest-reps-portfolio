import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { getCurrentUser } from "@/core/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import { Screen } from "@/components/screen"
import { Button } from "@/components/ui/button"
import { currentTargets, userCalorieFloor } from "@/modules/nutrition/targets/current"
import { signOut } from "./actions"
import { NameRow, ScaleRow, UnitsRow } from "./settings-rows"
import { TargetsForm } from "./targets-form"

export const metadata: Metadata = { title: "More" }

/**
 * More, was Me (NAV_SPEC 6): Goals, App and Account rows. Rows for features
 * that have not shipped (reminder times, subscription, delete account, coach
 * settings) appear when they do (Q64).
 */
export default function MorePage() {
  return (
    <Screen title="More">
      <Suspense fallback={<div className="h-96" />}>
        <Groups />
      </Suspense>
    </Screen>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `group-${title.toLowerCase()}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h2 id={id} className="px-1 text-label text-text-muted uppercase">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-border rounded-lg bg-surface px-4">{children}</div>
    </section>
  )
}

function LinkRow({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const className = "flex min-h-14 items-center justify-between gap-3 text-body"
  const inner = (
    <>
      <span>{children}</span>
      <ChevronRight aria-hidden className="size-5 text-text-muted" />
    </>
  )
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  )
}

async function Groups() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const [{ data: profile }, { data: nutrition }, targets, floor] = await Promise.all([
    supabase.from("profiles").select("tier, units, display_name").eq("id", user.id).single(),
    supabase.from("nutrition_profiles").select("has_scale").eq("user_id", user.id).maybeSingle(),
    currentTargets(supabase, user.id),
    userCalorieFloor(supabase, user.id),
  ])
  const free = profile?.tier === "free"

  return (
    <>
      <Group title="Goals">
        <div id="targets" className="flex scroll-mt-4 flex-col gap-3 py-4" aria-labelledby="targets-heading" role="region">
          <h3 id="targets-heading" className="text-headline">
            Targets
          </h3>
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
        </div>
      </Group>

      <Group title="App">
        <LinkRow href="/more/foods">My foods</LinkRow>
        <UnitsRow initial={profile?.units === "metric" ? "metric" : "imperial"} />
        <LinkRow href="/install?from=more">Add to Home Screen and turn on reminders</LinkRow>
        <ScaleRow initial={(nutrition?.has_scale as boolean | null | undefined) ?? null} />
      </Group>

      <Group title="Account">
        <NameRow initial={(profile?.display_name as string | null) ?? ""} />
        <div className="flex min-h-14 flex-col justify-center py-2">
          <span className="text-caption text-text-muted">Signed in as</span>
          <span className="text-body break-all">{user.email}</span>
        </div>
        <LinkRow href="/legal/privacy">Privacy and data</LinkRow>
        <LinkRow href="/legal/terms">Terms</LinkRow>
        <div className="flex min-h-14 flex-col justify-center py-2">
          <span className="text-body">About</span>
          <p className="text-caption text-text-muted">
            Food data from{" "}
            <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent-strong underline">
              Open Food Facts
            </a>
          </p>
        </div>
        <form action={signOut} className="py-3">
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </Group>
    </>
  )
}
