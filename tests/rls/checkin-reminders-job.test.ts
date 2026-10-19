import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { runCheckinReminders } from "@/core/jobs/checkin-reminders"
import { createCast, deleteCast, type Cast } from "./fixtures"

// Q76: the reminder job is idempotent and logs every run to events as job_run.
let cast: Cast
const MORNING = new Date("2026-10-30T12:05:00Z") // Friday 8:05am in New York; check-in open since 6:00am Chicago

beforeAll(async () => {
  cast = await createCast()
  await cast.admin.from("profiles").update({ timezone: "America/Chicago" }).eq("id", cast.coach.id)
  await cast.admin.from("profiles").update({ timezone: "America/New_York", tier: "paid", billing_source: "comped" }).eq("id", cast.a.id)
  const settings = await cast.admin.from("coach_settings").insert({
    coach_id: cast.coach.id,
    checkin_day: 5,
    review_day: 0,
    weekly_cycle: { checkin_opens_at: "06:00", overdue_after_hours: 24 },
    reminder_defaults: { checkin_reminder: "08:00", checkin_followup: "19:00" },
  })
  if (settings.error) throw settings.error
})
afterAll(async () => {
  await deleteCast(cast)
})

async function jobRuns(since: string) {
  const { data } = await cast.admin.from("events").select("props").eq("name", "job_run").is("user_id", null).gte("created_at", since)
  return (data ?? []).map((e) => e.props as Record<string, unknown>)
}

describe("checkin reminder job", () => {
  it("claims each reminder once across repeated runs and logs every run", async () => {
    const since = new Date().toISOString()
    const first = await runCheckinReminders(cast.admin, MORNING)
    const second = await runCheckinReminders(cast.admin, MORNING)
    expect(first.outcome).toBe("ok")
    expect(second.outcome).toBe("ok")

    const { data: sent } = await cast.admin.from("notifications_sent").select("kind, ref").eq("user_id", cast.a.id)
    expect(sent).toEqual([{ kind: "checkin_open", ref: "2026-10-30" }])
    // The second run found nothing new for a: it was claimed by the first.
    expect(second.claimed).toBeLessThan(first.claimed)

    const runs = await jobRuns(since)
    expect(runs).toHaveLength(2)
    for (const props of runs) expect(props).toMatchObject({ job: "checkin_reminders", outcome: "ok" })
  })

  it("members cannot write job_run themselves", async () => {
    const { error } = await cast.a.client.from("events").insert({ user_id: cast.a.id, name: "job_run", props: {} })
    expect(error).not.toBeNull()
  })
})
