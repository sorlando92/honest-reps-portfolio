import { NextResponse } from "next/server"
import { z } from "zod"
import { denyWithoutAi } from "@/core/auth/ai-access"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseForUser } from "@/modules/nutrition/parsing/service"
import { withinRateLimit } from "@/core/rate-limit"

// Caps model spend per user: a heavy logger logs maybe 15 meals a day.
const PARSES_PER_HOUR = 60

const body = z.object({
  text: z.string().trim().min(1).max(2000),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
})

/** Meal text to a draft confirmation card. Nothing is saved to food_entries here. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  // Before the rate limiter and the model: the coach turns AI on per client.
  const denied = await denyWithoutAi(supabase, userId)
  if (denied) return denied

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  if (!(await withinRateLimit(createAdminClient(), `parse:${userId}`, PARSES_PER_HOUR, 3600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const draft = await parseForUser(supabase, userId, parsed.data.text, parsed.data.localTime)
  return NextResponse.json(draft)
}
