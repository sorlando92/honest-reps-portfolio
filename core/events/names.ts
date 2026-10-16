// PRD section 5 "Metrics and instrumentation". The only event names the app
// may emit; the /api/events route rejects anything else. The database keeps
// the same list in the events_name_known check (tests/rls compares them).
export const EVENT_NAMES = [
  "signup_started",
  "signup_completed",
  "onboarding_completed",
  "pwa_installed",
  "push_enabled",
  "food_logged",
  "food_entry_corrected",
  "food_entry_deleted",
  "weight_logged",
  "habit_checked",
  "checkin_started",
  "checkin_submitted",
  "report_viewed",
  "message_sent",
  "upgrade_viewed",
  "upgrade_completed",
  "subscription_canceled",
  "review_card_opened",
  "review_reply_sent",
  "meal_copied",
  "day_switched",
  "streak_milestone",
  "day_note_saved",
  "macro_card_mode_changed",
  "progress_viewed",
  "progress_week_changed",
  "weight_range_changed",
] as const

export type EventName = (typeof EVENT_NAMES)[number]

/** Events that can happen before the user has an account or session. */
export const PRE_AUTH_EVENTS = ["signup_started", "pwa_installed"] as const satisfies readonly EventName[]

/**
 * Events only the server writes, with the service role (signup trigger,
 * Stripe webhook, review send). RLS refuses them from a signed in client.
 */
export const SERVER_ONLY_EVENTS = [
  "signup_completed",
  "upgrade_completed",
  "subscription_canceled",
  "review_reply_sent",
] as const satisfies readonly EventName[]

export type EventProps = Record<string, string | number | boolean | null>

export function isEventName(value: string): value is EventName {
  return (EVENT_NAMES as readonly string[]).includes(value)
}

export function isPreAuthEvent(name: EventName): boolean {
  return (PRE_AUTH_EVENTS as readonly string[]).includes(name)
}

export function isServerOnlyEvent(name: string): boolean {
  return (SERVER_ONLY_EVENTS as readonly string[]).includes(name)
}
