import "server-only"
// Relative imports with extensions so `pnpm eval:parsing` can run this file
// directly in Node, which does not know the @/ alias.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Per100g, Portion, UsdaFood } from "./usda.ts"

// QUESTIONS.md Q40: generic foods (Foundation, SR Legacy, FNDDS) are searched
// in our own copy, public.fdc_foods, loaded by scripts/import-fdc.mts.
const CANDIDATES = 100

let client: SupabaseClient | null = null

function admin(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the local food search.")
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

interface FdcRow {
  fdc_id: number
  data_type: string
  description: string
  per_100g: Per100g
  portions: Portion[]
}

/** Foods sharing any word with the query, best full text match first, for the matcher to rank. */
export async function searchFdcLocal(query: string, limit = CANDIDATES): Promise<UsdaFood[]> {
  const { data, error } = await admin().rpc("search_fdc", { p_query: query, p_limit: limit })
  if (error) throw new Error(`Local food search failed: ${error.message}`)
  return ((data ?? []) as FdcRow[]).map((r) => ({
    fdcId: r.fdc_id,
    description: r.description,
    dataType: r.data_type,
    brand: null,
    per100g: r.per_100g,
    ...(r.portions[0] ? { portion: r.portions[0] } : {}),
  }))
}

/** A generic food's first common portion from the local copy. */
export async function fdcPortion(fdcId: string): Promise<Portion | null> {
  const { data } = await admin().from("fdc_foods").select("portions").eq("fdc_id", Number(fdcId)).maybeSingle()
  return ((data?.portions as Portion[] | undefined) ?? [])[0] ?? null
}
