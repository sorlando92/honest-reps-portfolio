"use server"

import { getCurrentUser } from "@/core/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import { isValidTimezone } from "./local-day"

/**
 * Keeps the profile timezone on the device's timezone (QUESTIONS.md Q43).
 * The database trigger rejects names Postgres does not know.
 */
export async function syncTimezone(timezone: string): Promise<{ changed: boolean }> {
  if (typeof timezone !== "string" || timezone.length > 64 || !isValidTimezone(timezone)) return { changed: false }
  const user = await getCurrentUser()
  if (user.timezone === timezone) return { changed: false }
  const supabase = await createClient()
  const { error } = await supabase.from("profiles").update({ timezone }).eq("id", user.id)
  return { changed: !error }
}
