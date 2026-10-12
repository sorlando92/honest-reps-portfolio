import { createBrowserClient } from "@supabase/ssr"
import { publicEnv } from "@/lib/env"

/** Supabase client for Client Components, acting as the signed in user. */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
}
