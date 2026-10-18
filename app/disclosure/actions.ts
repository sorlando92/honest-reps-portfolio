"use server"

import { redirect } from "next/navigation"
import { getCurrentUser } from "@/core/auth/current-user"
import { disclosureVersion } from "@/core/compliance/disclosure"
import { createClient } from "@/lib/supabase/server"

/** Records the state disclosure acceptance (consents, kind mo_disclosure) with a server timestamp. */
export async function acceptDisclosure(): Promise<{ error: string } | void> {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const version = await disclosureVersion(supabase)
  const { error } = await supabase.from("consents").insert({ user_id: user.id, kind: "mo_disclosure", version })
  if (error) {
    console.error("[disclosure] save failed", { userId: user.id, code: error.code })
    return { error: "Not saved. Try again." }
  }
  redirect("/today")
}
