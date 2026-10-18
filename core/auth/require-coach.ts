import "server-only"
import { createClient } from "@/lib/supabase/server"

/** The signed in coach for API routes, or null (the route answers 403). */
export async function requireCoach(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).single()
  if (profile?.role !== "coach") return null
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
}
