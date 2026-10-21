import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

const PHOTO_BUCKET = "checkin-photos"

/**
 * Deletes an account and everything tied to it (security audit L2; the
 * manual steps in docs/ARCHITECTURE.md "Account deletion" match this).
 * Deleting the auth user cascades to the profile and every row owned
 * through it. First it removes what the cascade would leave behind: the
 * user's ai_calls (they hold meal text and only lose their user id), the
 * email recorded on an invite they claimed, and their check-in photos in
 * Storage. Needs the service role client. Returns false if any step failed.
 */
export async function deleteAccount(admin: SupabaseClient, userId: string): Promise<boolean> {
  const steps = await Promise.all([
    admin.from("ai_calls").delete().eq("user_id", userId),
    admin.from("invites").update({ claimed_email: null }).eq("claimed_by", userId),
  ])
  if (steps.some((s) => s.error)) return false
  if (!(await removePhotos(admin, userId))) return false
  const { error } = await admin.auth.admin.deleteUser(userId)
  return !error
}

/** Photos live at {userId}/{checkinId}/{position}.jpg. */
async function removePhotos(admin: SupabaseClient, userId: string): Promise<boolean> {
  const bucket = admin.storage.from(PHOTO_BUCKET)
  const { data: checkins, error } = await bucket.list(userId, { limit: 1000 })
  if (error) return false
  const paths: string[] = []
  for (const folder of checkins ?? []) {
    const { data: files, error: listError } = await bucket.list(`${userId}/${folder.name}`, { limit: 100 })
    if (listError) return false
    for (const file of files ?? []) paths.push(`${userId}/${folder.name}/${file.name}`)
  }
  if (!paths.length) return true
  const { error: removeError } = await bucket.remove(paths)
  return !removeError
}
