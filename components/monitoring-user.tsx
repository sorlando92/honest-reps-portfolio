"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

/** Tags browser errors with the signed in user's id, and nothing else about them. */
export function MonitoringUser({ id }: { id: string }) {
  useEffect(() => {
    Sentry.setUser({ id })
    return () => Sentry.setUser(null)
  }, [id])
  return null
}
