"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

/** Marks the replies on screen as read (RLS lets the client set read_at only). */
export function MarkRepliesRead({ ids }: { ids: string[] }) {
  useEffect(() => {
    // Query builders run only when awaited or then-ed.
    createClient()
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .is("read_at", null)
      .then(({ error }) => {
        if (error) console.error("[coach] marking replies read failed", error.code)
      })
  }, [ids])
  return null
}
