"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { installDismissals, installSeenThisSession } from "@/lib/install-prompt"
import { isStandalone } from "./pwa-runtime"

/**
 * Q62: after one "Not now", the install screen shows once more on the next
 * app open (a new session) with "Skip"; after that it never comes back.
 */
export function InstallGate() {
  const router = useRouter()
  useEffect(() => {
    if (!isStandalone() && installDismissals() === 1 && !installSeenThisSession()) router.replace("/install")
  }, [router])
  return null
}
