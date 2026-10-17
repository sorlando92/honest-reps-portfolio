"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/sign-in")
}

/** More, App: imperial or metric (profiles.units; users may update it). */
export async function setUnits(units: "imperial" | "metric") {
  if (units !== "imperial" && units !== "metric") return { ok: false }
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return { ok: false }
  const { error } = await supabase.from("profiles").update({ units }).eq("id", userId)
  return { ok: !error }
}

/** More, App: the food scale answer from onboarding (PRD F1 has_scale). */
export async function setHasScale(hasScale: boolean) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return { ok: false }
  const { error } = await supabase.from("nutrition_profiles").update({ has_scale: hasScale === true, updated_at: new Date().toISOString() }).eq("user_id", userId)
  return { ok: !error }
}

/** More, Account: the name in "Hi, {first name}" (Q63). Empty clears it. */
export async function setDisplayName(name: string) {
  const value = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 60) : ""
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return { ok: false }
  const { error } = await supabase.from("profiles").update({ display_name: value || null }).eq("id", userId)
  return { ok: !error }
}
