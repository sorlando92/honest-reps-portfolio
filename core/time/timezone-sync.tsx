"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { syncTimezone } from "./actions"

/**
 * Corrects the profile timezone when the device reports a different one, then
 * refreshes so times and day boundaries rerender. Accounts created without a
 * timezone (the seeded coach) start on UTC and are fixed on first open.
 */
export function TimezoneSync({ profileTimezone }: { profileTimezone: string }) {
  const router = useRouter()
  useEffect(() => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!device || device === profileTimezone) return
    syncTimezone(device)
      .then(({ changed }) => {
        if (changed) router.refresh()
      })
      .catch(() => {})
  }, [profileTimezone, router])
  return null
}
