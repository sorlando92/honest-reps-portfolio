import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { track } from "@/core/events/track"
import { deleteEntry, editEntry, editEntryBody } from "@/modules/nutrition/entries/edit"

const entryId = z.uuid()

async function signedIn() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims?.sub ? supabase : null
}

/** Saves an edited entry from the timeline editor. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/entries/[id]">) {
  const supabase = await signedIn()
  if (!supabase) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const id = entryId.safeParse((await ctx.params).id)
  const body = editEntryBody.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return NextResponse.json({ error: "Invalid entry" }, { status: 400 })

  const result = await editEntry(supabase, id.data, body.data)
  if (!result.ok) return NextResponse.json({ error: "Not saved" }, { status: result.status })
  await track("food_entry_corrected", result.props)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/entries/[id]">) {
  const supabase = await signedIn()
  if (!supabase) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const id = entryId.safeParse((await ctx.params).id)
  if (!id.success) return NextResponse.json({ error: "Invalid entry" }, { status: 400 })

  const result = await deleteEntry(supabase, id.data)
  if (!result.ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await track("food_entry_deleted", { method: result.method ?? "unknown" })
  return NextResponse.json({ ok: true })
}
