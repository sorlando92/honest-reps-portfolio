import { Suspense } from "react"
import type { Metadata } from "next"
import { getCurrentUser } from "@/core/auth/current-user"
import { addDays, localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { EmptyState, Screen } from "@/components/screen"
import { MEALS, mealWindows, SECTION_LABEL, type Meal } from "@/modules/nutrition/entries/meals"
import { quickAddChips } from "@/modules/nutrition/entries/quick-add"
import { dayEntries, type TimelineEntry } from "@/modules/nutrition/entries/today"
import { LogFlow } from "@/modules/nutrition/ui/log-flow"
import { MealSectionControls } from "@/modules/nutrition/ui/meal-section-controls"
import { TimelineRow } from "@/modules/nutrition/ui/timeline-row"

export const metadata: Metadata = { title: "Today" }

export default function TodayPage() {
  return (
    // Room for the log bar pinned above the tab bar.
    <div className="pb-20">
      <Screen title="Today">
        <Suspense fallback={<EmptyState>Loading today.</EmptyState>}>
          <Meals />
        </Suspense>
      </Screen>
    </div>
  )
}

/** Today's entries in meal sections (docs/TODAY_SPEC.md 6). */
async function Meals() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const [{ data: profile }, { data: nutrition }, { data: windowsConfig }] = await Promise.all([
    supabase.from("profiles").select("units, timezone").eq("id", user.id).single(),
    supabase.from("nutrition_profiles").select("has_scale").eq("user_id", user.id).maybeSingle(),
    supabase.from("app_config").select("value").eq("key", "meal_windows").maybeSingle(),
  ])
  const hasScale = (nutrition?.has_scale as boolean | null | undefined) ?? null
  const timezone = profile?.timezone ?? "UTC"
  const units = profile?.units === "metric" ? "metric" : "imperial"
  const today = localToday(timezone)
  const yesterday = addDays(today, -1)

  const [entries, yesterdays, chips] = await Promise.all([
    dayEntries(supabase, user.id, timezone, today),
    dayEntries(supabase, user.id, timezone, yesterday),
    quickAddChips(supabase, user.id, timezone),
  ])
  const { data: favorites } = entries.length
    ? await supabase.from("favorites").select("id, source_entry_id").eq("user_id", user.id).in("source_entry_id", entries.map((e) => e.id))
    : { data: [] }
  const favoriteOf = new Map((favorites ?? []).map((f) => [f.source_entry_id as string, f.id as string]))
  const yesterdayMeals = new Set(yesterdays.map((e) => e.meal))

  return (
    <>
      <ul aria-label="Today's entries" className="flex flex-col gap-6">
        {MEALS.map((meal) => (
          <li key={meal}>
            <MealSection
              meal={meal}
              entries={entries.filter((e) => e.meal === meal)}
              copy={yesterdayMeals.has(meal) ? { fromDate: yesterday, label: `Copy yesterday's ${SECTION_LABEL[meal].toLowerCase()}` } : null}
            >
              {(e) => <TimelineRow entry={{ ...e, favoriteId: favoriteOf.get(e.id) ?? null }} units={units} hasScale={hasScale} />}
            </MealSection>
          </li>
        ))}
      </ul>
      <LogFlow units={units} hasScale={hasScale} chips={chips} timezone={timezone} mealWindows={mealWindows(windowsConfig?.value)} />
    </>
  )
}

function MealSection({
  meal,
  entries,
  copy,
  children,
}: {
  meal: Meal
  entries: TimelineEntry[]
  copy: { fromDate: string; label: string } | null
  children: (entry: TimelineEntry) => React.ReactNode
}) {
  const name = SECTION_LABEL[meal]
  const calories = entries.reduce((s, e) => s + e.calories, 0)
  const protein = entries.reduce((s, e) => s + e.proteinG, 0)
  return (
    <section aria-labelledby={`meal-${meal}`}>
      <div className="flex min-h-11 items-center gap-2 border-b border-border">
        <h2 id={`meal-${meal}`} className="text-headline">
          {name}
        </h2>
        {entries.length > 0 && (
          <span className="text-caption text-text-muted tabular-nums">
            {calories} cal · {protein} g protein
          </span>
        )}
        <span className="ml-auto">
          <MealSectionControls meal={meal} copy={copy} />
        </span>
      </div>
      {entries.length > 0 && (
        <ul aria-label={`${name} entries`} className="flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id}>{children(e)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
