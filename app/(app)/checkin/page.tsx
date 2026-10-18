import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { toQuestion } from "@/core/checkins/questions"
import { checkinState, isDue } from "@/core/checkins/state"
import { CheckinFlow } from "@/core/checkins/ui/checkin-flow"
import { addDays, localToday } from "@/core/time/local-day"
import { createClient } from "@/lib/supabase/server"
import { ewma, trendAlpha } from "@/modules/nutrition/weight/trend"

export const metadata: Metadata = { title: "Check-in" }

/** Weekly check-in (PRD F5). Only open, unsent check-ins of paid clients land here. */
export default function CheckinPage() {
  return (
    <Suspense fallback={null}>
      <Checkin />
    </Suspense>
  )
}

async function Checkin() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const state = await checkinState(supabase, user.id)
  if (!isDue(state)) redirect("/today")

  const today = localToday(user.timezone)
  const [{ data: profile }, { data: rows }, { data: weights }, { data: trendConfig }] = await Promise.all([
    supabase.from("profiles").select("units, coach_id").eq("id", user.id).single(),
    supabase.from("checkin_questions").select("id, position, type, prompt, low_label, high_label, optional, report_tag").eq("active", true).order("position"),
    supabase.from("weights").select("date, weight_kg").eq("user_id", user.id).gte("date", addDays(today, -120)).lte("date", today).order("date"),
    supabase.from("app_config").select("value").eq("key", "weight_trend").maybeSingle(),
  ])
  const questions = (rows ?? []).map(toQuestion)

  // Q72: today's weigh-in, else the latest trend.
  const weighIns = (weights ?? []).map((w) => ({ date: w.date as string, kg: Number(w.weight_kg) }))
  const todays = weighIns.find((w) => w.date === today)?.kg ?? null
  const trend = ewma(weighIns, trendAlpha(trendConfig?.value)).at(-1)?.trendKg ?? null

  return (
    <CheckinFlow questions={questions} units={profile?.units === "metric" ? "metric" : "imperial"} prefillKg={todays ?? trend} />
  )
}
