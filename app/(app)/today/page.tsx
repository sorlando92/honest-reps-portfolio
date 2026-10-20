import { Suspense } from "react"
import type { Metadata } from "next"
import { cn } from "cn"
import { getCurrentUser } from "@/core/auth/current-user"
import { CheckinCard } from "@/core/checkins/ui/checkin-card"
import { addDays, localDate, localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/screen"
import { InstallBanner } from "@/components/pwa/install-banner"
import { getPublicConfig } from "@/core/settings/public-config"
import { dailyTotals, loggingStreak } from "@/modules/nutrition/days/daily"
import { formatNumber, insightText, weekInsight, weekStart } from "@/modules/nutrition/days/week"
import { MEALS, mealAnchors, mealWindows, SECTION_LABEL, type Meal } from "@/modules/nutrition/entries/meals"
import { quickAddChips } from "@/modules/nutrition/entries/quick-add"
import { dayEntries, type TimelineEntry } from "@/modules/nutrition/entries/today"
import { changePhrase, ewma, formatWeight, trendAlpha, trendChange, type Units } from "@/modules/nutrition/weight/trend"
import { LogFlow } from "@/modules/nutrition/ui/log-flow"
import { MealSectionControls } from "@/modules/nutrition/ui/meal-section-controls"
import { TimelineRow } from "@/modules/nutrition/ui/timeline-row"
import { DayNote } from "@/modules/nutrition/ui/today/day-note"
import { HeaderBand } from "@/modules/nutrition/ui/today/header-band"
import { TodayQuickActions } from "@/modules/nutrition/ui/today/today-quick-actions"
import { MacroCard } from "@/modules/nutrition/ui/today/macro-card"
import { MACRO_CHIP, MACRO_LETTER, MACRO_TEXT, type Macro } from "@/modules/nutrition/ui/today/macros"
import { WeightRow } from "@/modules/nutrition/ui/today/weight-row"

export const metadata: Metadata = { title: "Today" }

// Enough weigh-in history for the EWMA to settle before the shown day.
const TREND_HISTORY_DAYS = 120

/**
 * The journal (docs/NAV_SPEC.md over docs/SCREENS_V2.md "Today" over
 * docs/TODAY_SPEC.md). `?date=` picks a past day; `?qa=` runs a quick action.
 */
export default function TodayPage({ searchParams }: PageProps<"/today">) {
  return (
    // Room for the log bar floating above the tab bar.
    <main className="flex flex-col gap-3 pb-20">
      <Suspense fallback={<EmptyState>Loading today.</EmptyState>}>
        <Journal searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Journal({ searchParams }: { searchParams: PageProps<"/today">["searchParams"] }) {
  const { date: param } = await searchParams
  const requested = typeof param === "string" ? param : null
  const user = await getCurrentUser()
  const supabase = await createClient()
  const [{ data: profile }, { data: nutrition }, { data: config }, { productName }] = await Promise.all([
    supabase.from("profiles").select("units, timezone").eq("id", user.id).single(),
    supabase.from("nutrition_profiles").select("has_scale").eq("user_id", user.id).maybeSingle(),
    supabase.from("app_config").select("key, value").in("key", ["meal_windows", "meal_anchors", "weight_trend"]),
    getPublicConfig(),
  ])
  const setting = (key: string) => config?.find((c) => c.key === key)?.value
  const hasScale = (nutrition?.has_scale as boolean | null | undefined) ?? null
  const timezone = profile?.timezone ?? "UTC"
  const units: Units = profile?.units === "metric" ? "metric" : "imperial"
  const today = localToday(timezone)
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today
  const isToday = date === today
  const yesterday = addDays(date, -1)
  const monday = weekStart(date)

  const [week, streak, entries, yesterdays, chips, { data: weights }, { data: note }, firstWeek] = await Promise.all([
    dailyTotals(supabase, user.id, monday, addDays(monday, 6)),
    loggingStreak(supabase, user.id, today),
    dayEntries(supabase, user.id, timezone, date),
    isToday ? dayEntries(supabase, user.id, timezone, yesterday) : Promise.resolve([]),
    quickAddChips(supabase, user.id, timezone),
    supabase
      .from("weights")
      .select("date, weight_kg")
      .eq("user_id", user.id)
      .gte("date", addDays(date, -TREND_HISTORY_DAYS))
      .lte("date", date)
      .order("date"),
    supabase.from("day_notes").select("body").eq("user_id", user.id).eq("local_date", date).maybeSingle(),
    accountFirstWeek(supabase, user.id, timezone, today),
  ])
  const { data: favorites } = entries.length
    ? await supabase.from("favorites").select("id, source_entry_id").eq("user_id", user.id).in("source_entry_id", entries.map((e) => e.id))
    : { data: [] }
  const favoriteOf = new Map((favorites ?? []).map((f) => [f.source_entry_id as string, f.id as string]))
  const yesterdayMeals = new Set(yesterdays.map((e) => e.meal))

  const selected = week.find((d) => d.date === date)!
  const insight = weekInsight(week, date)

  const weighIns = (weights ?? []).map((w) => ({ date: w.date as string, kg: Number(w.weight_kg) }))
  const points = ewma(weighIns, trendAlpha(setting("weight_trend")))
  const trend = trendChange(points, date, 7)
  const trendLine = trend
    ? `Trend ${formatWeight(trend.trendKg, units)}${trend.changeKg === null ? "" : `, ${changePhrase(trend.changeKg, units, "this week")}`}`
    : null
  const byDate = new Map(weighIns.map((w) => [w.date, w.kg]))
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(date, -i)).map((d) => ({ date: d, kg: byDate.get(d) ?? null }))

  return (
    <>
      <HeaderBand date={date} today={today} firstWeek={firstWeek < monday ? firstWeek : monday} week={week} day={selected} target={selected.target} />
      <InstallBanner productName={productName} />
      <MacroCard
        day={selected}
        target={selected.target}
        week={week}
        insight={insight ? insightText(insight) : null}
        streak={streak}
        date={date}
        today={today}
      />
      {isToday && <CheckinCard supabase={supabase} userId={user.id} timezone={timezone} />}
      <ul aria-label={isToday ? "Today's entries" : "Entries"} className="flex flex-col gap-3">
        {MEALS.map((meal) => {
          const mealEntries = entries.filter((e) => e.meal === meal)
          const copy = isToday
            ? yesterdayMeals.has(meal)
              ? { fromDate: yesterday, label: `Copy yesterday's ${SECTION_LABEL[meal].toLowerCase()}` }
              : null
            : mealEntries.length > 0
              ? { fromDate: date, label: "Copy to today" }
              : null
          return (
            <li key={meal}>
              <MealCard meal={meal} entries={mealEntries} copy={copy}>
                {(e) => <TimelineRow entry={{ ...e, favoriteId: favoriteOf.get(e.id) ?? null }} units={units} hasScale={hasScale} />}
              </MealCard>
            </li>
          )
        })}
      </ul>
      <WeightRow date={date} isToday={isToday} weighInKg={byDate.get(date) ?? null} trend={trendLine} last7={last7} units={units} />
      <DayNote key={date} date={date} initial={(note?.body as string | undefined) ?? ""} />
      <LogFlow
        units={units}
        hasScale={hasScale}
        chips={chips}
        timezone={timezone}
        mealWindows={mealWindows(setting("meal_windows"))}
        mealAnchors={mealAnchors(setting("meal_anchors"))}
        date={date}
        aiEnabled={user.aiEnabled}
      />
      <TodayQuickActions date={date} timezone={timezone} mealWindows={mealWindows(setting("meal_windows"))} />
    </>
  )
}

/** DESIGN_SYSTEM.md "Meal card": header, P, C, F, kcal chips, then entries. */
function MealCard({
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
  const sum = (pick: (e: TimelineEntry) => number) => entries.reduce((s, e) => s + pick(e), 0)
  const chips: [Macro, number, string][] = [
    ["protein", sum((e) => e.proteinG), "grams protein"],
    ["carbs", sum((e) => e.carbsG), "grams carbs"],
    ["fat", sum((e) => e.fatG), "grams fat"],
    ["calories", sum((e) => e.calories), "calories"],
  ]
  return (
    <section aria-labelledby={`meal-${meal}`} className="rounded-lg bg-surface px-4 pt-1 pb-3">
      <div className="flex min-h-11 items-center gap-2">
        <h2 id={`meal-${meal}`} className="text-headline">
          {name}
        </h2>
        <span className="ml-auto">
          <MealSectionControls meal={meal} copy={copy} />
        </span>
      </div>
      <ul aria-label={`${name} totals`} className="flex flex-wrap gap-1.5">
        {chips.map(([macro, value, unit]) => (
          <li key={macro} className={cn("rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums", MACRO_CHIP[macro], MACRO_TEXT[macro])}>
            <span className="sr-only">{`${formatNumber(value)} ${unit}`}</span>
            <span aria-hidden>
              {MACRO_LETTER[macro] === "kcal" ? `${formatNumber(value)} kcal` : `${MACRO_LETTER[macro]} ${formatNumber(value)}`}
            </span>
          </li>
        ))}
      </ul>
      {entries.length > 0 && (
        <ul aria-label={`${name} entries`} className="mt-2 flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id}>{children(e)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Monday of the account's first week in the user's timezone: the earliest of
 * sign up, the first entry and the first weigh-in (NAV_SPEC 4: the week strip
 * slides back to it).
 */
async function accountFirstWeek(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, timezone: string, today: string): Promise<string> {
  const [{ data: profile }, { data: entry }, { data: weight }] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", userId).single(),
    supabase.from("food_entries").select("logged_at").eq("user_id", userId).order("logged_at").limit(1).maybeSingle(),
    supabase.from("weights").select("date").eq("user_id", userId).order("date").limit(1).maybeSingle(),
  ])
  const dates = [today]
  if (profile?.created_at) dates.push(localDate(profile.created_at as string, timezone))
  if (entry?.logged_at) dates.push(localDate(entry.logged_at as string, timezone))
  if (weight?.date) dates.push(weight.date as string)
  return weekStart(dates.sort()[0])
}
