import type { SupabaseClient } from "@supabase/supabase-js"

export interface CheckinState {
  eligible: boolean
  weekOf: string
  opensAt: string
  overdueAt: string
  closesAt: string
  isOpen: boolean
  checkinId: string | null
  submittedAt: string | null
  onTime: boolean | null
}

/** The user's current check-in week (checkin_state), or null without a coach or settings. */
export async function checkinState(supabase: SupabaseClient, userId: string, now?: Date): Promise<CheckinState | null> {
  const { data, error } = await supabase.rpc("checkin_state", { p_user: userId, ...(now ? { p_now: now.toISOString() } : {}) })
  const row = data?.[0]
  if (error || !row) return null
  return {
    eligible: row.eligible,
    weekOf: row.week_of,
    opensAt: row.opens_at,
    overdueAt: row.overdue_at,
    closesAt: row.closes_at,
    isOpen: row.is_open,
    checkinId: row.checkin_id,
    submittedAt: row.submitted_at,
    onTime: row.on_time,
  }
}

/** Due means open and not yet submitted, for a paid client. */
export function isDue(state: CheckinState | null): state is CheckinState & { isOpen: true; submittedAt: null } {
  return Boolean(state?.eligible && state.isOpen && !state.submittedAt)
}

export function isOverdue(state: CheckinState, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(state.overdueAt).getTime()
}

/** The last day the check-in is still open, as a weekday in the user's zone ("Saturday"). */
export function lastOpenDay(state: CheckinState, timezone: string): string {
  const last = new Date(new Date(state.closesAt).getTime() - 1000)
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(last)
}
