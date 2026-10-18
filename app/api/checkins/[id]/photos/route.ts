import { NextResponse } from "next/server"
import { openOwnCheckin } from "@/core/checkins/owned"
import { MAX_PHOTOS } from "@/core/checkins/questions"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

async function context(id: string) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) }
  if (!(await openOwnCheckin(supabase, userId, id))) return { error: NextResponse.json({ error: "Not open" }, { status: 409 }) }
  return { userId }
}

const pathFor = (userId: string, id: string, position: number) => `${userId}/${id}/${position}.jpg`

/** Adds a progress photo (resized on the phone) at position 1 to 3, replacing any there. */
export async function POST(request: Request, { params }: RouteContext<"/api/checkins/[id]/photos">) {
  const { id } = await params
  const ctx = await context(id)
  if ("error" in ctx) return ctx.error
  const form = await request.formData().catch(() => null)
  const file = form?.get("photo")
  const position = Number(form?.get("position"))
  if (!(file instanceof Blob) || !TYPES.has(file.type) || file.size > MAX_BYTES || !Number.isInteger(position) || position < 1 || position > MAX_PHOTOS) {
    return NextResponse.json({ error: "Invalid photo" }, { status: 400 })
  }
  const admin = createAdminClient()
  const path = pathFor(ctx.userId, id, position)
  const upload = await admin.storage.from("checkin-photos").upload(path, file, { contentType: file.type, upsert: true })
  if (upload.error) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  const { error } = await admin
    .from("checkin_photos")
    .upsert({ checkin_id: id, user_id: ctx.userId, position, storage_path: path }, { onConflict: "checkin_id,position" })
  if (error) return NextResponse.json({ error: "Not saved" }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Removes the photo at ?position= before the check-in is sent (PRD F16: users can delete photos). */
export async function DELETE(request: Request, { params }: RouteContext<"/api/checkins/[id]/photos">) {
  const { id } = await params
  const ctx = await context(id)
  if ("error" in ctx) return ctx.error
  const position = Number(new URL(request.url).searchParams.get("position"))
  if (!Number.isInteger(position) || position < 1 || position > MAX_PHOTOS) return NextResponse.json({ error: "Invalid position" }, { status: 400 })
  const admin = createAdminClient()
  await admin.storage.from("checkin-photos").remove([pathFor(ctx.userId, id, position)])
  await admin.from("checkin_photos").delete().eq("checkin_id", id).eq("position", position)
  return NextResponse.json({ ok: true })
}
