import "server-only"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { publicEnv } from "@/lib/env"

/** Supabase client acting as the signed in user. RLS applies. */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read only.
          // proxy.ts refreshes the session cookie on every request instead.
        }
      },
    },
  })
}
