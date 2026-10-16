"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { finishInstallBanner, installBannerDue } from "@/lib/install-prompt"
import { isStandalone } from "./pwa-runtime"

const noSubscribe = () => () => {}
const due = () => !isStandalone() && installBannerDue()

/**
 * Q62: one dismissible reminder on Today, 3 days after the install screen was
 * dismissed, while the app is still not installed. Dismissing it, or opening
 * the install screen from it, ends the prompts for good.
 */
export function InstallBanner({ productName }: { productName: string }) {
  const show = useSyncExternalStore(noSubscribe, due, () => false)
  const [closed, setClosed] = useState(false)
  if (!show || closed) return null
  return (
    <section aria-label="Install" className="flex items-center gap-2 rounded-lg border border-border py-1 pl-4">
      <p className="flex-1 text-body">Add {productName} to your Home Screen so reminders can reach you.</p>
      <Button asChild variant="text" className="h-11 px-3">
        <Link href="/install?from=today" onClick={finishInstallBanner}>
          Set up
        </Link>
      </Button>
      <Button
        variant="text"
        size="icon"
        aria-label="Dismiss"
        onClick={() => {
          finishInstallBanner()
          setClosed(true)
        }}
      >
        <X aria-hidden />
      </Button>
    </section>
  )
}
