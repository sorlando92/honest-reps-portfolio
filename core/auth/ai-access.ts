import "server-only"
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

/** The 403 body every AI route returns when the coach has not turned AI on. The UI reads `error`. */
export const AI_DISABLED = { error: "ai_disabled", message: "AI logging is off. Your coach will turn it on." } as const

/**
 * Whether the signed in user may call the model (profiles.ai_enabled, set
 * by their coach). Fails closed: a missing row, a missing value or a failed
 * lookup all count as off.
 */
export async function hasAiAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("profiles").select("ai_enabled").eq("id", userId).single()
    if (error) return false
    return data?.ai_enabled === true
  } catch {
    return false
  }
}

/** For routes that call Anthropic: null when allowed, else the 403 to return. Run it before the rate limiter. */
export async function denyWithoutAi(supabase: SupabaseClient, userId: string): Promise<NextResponse | null> {
  return (await hasAiAccess(supabase, userId)) ? null : NextResponse.json(AI_DISABLED, { status: 403 })
}
