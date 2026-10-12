import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

// Used only when app_config cannot be read (for example a build with no
// database). The real value is app_config.product_name, edited in Coach
// settings (F14).
const FALLBACK_PRODUCT_NAME = "Honest Reps"

export interface PublicConfig {
  productName: string
}

/**
 * Settings needed before sign in: the sign in page, page titles and the PWA
 * manifest. Read with the service role because app_config is not readable
 * by anonymous visitors (QUESTIONS.md Q5), and cached for an hour.
 */
export async function getPublicConfig(): Promise<PublicConfig> {
  "use cache"
  cacheTag("app-config")
  cacheLife("hours")

  try {
    const { data } = await createAdminClient()
      .from("app_config")
      .select("value")
      .eq("key", "product_name")
      .maybeSingle()
    const name = typeof data?.value === "string" && data.value.trim() ? data.value : FALLBACK_PRODUCT_NAME
    return { productName: name }
  } catch {
    return { productName: FALLBACK_PRODUCT_NAME }
  }
}
