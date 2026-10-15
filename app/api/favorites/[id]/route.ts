import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

/** Removes a favorite (RLS: own favorites only). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/favorites/[id]">) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  const id = z.uuid().safeParse((await ctx.params).id)
  if (!id.success) return NextResponse.json({ error: "Invalid favorite" }, { status: 400 })
  const { data: deleted } = await supabase.from("favorites").delete().eq("id", id.data).select("id")
  return deleted?.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 })
}
