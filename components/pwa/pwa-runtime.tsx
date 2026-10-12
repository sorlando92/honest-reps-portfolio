"use client"

import { useEffect } from "react"
import { track } from "@/core/events/client"

const INSTALL_TRACKED_KEY = "hr:pwa_installed_tracked"

/**
 * Registers the service worker and emits pwa_installed once per device.
 * Android Chrome fires appinstalled; iOS does not, so the first launch in
 * standalone mode counts as the install there.
 */
export function PwaRuntime() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {})
    }

    function markInstalled(platform: string) {
      try {
        if (localStorage.getItem(INSTALL_TRACKED_KEY)) return
        localStorage.setItem(INSTALL_TRACKED_KEY, "1")
      } catch {
        // Storage blocked: still record the event.
      }
      track("pwa_installed", { platform })
    }

    if (isStandalone()) markInstalled(platformName())

    const onInstalled = () => markInstalled(platformName())
    window.addEventListener("appinstalled", onInstalled)
    return () => window.removeEventListener("appinstalled", onInstalled)
  }, [])

  return null
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function platformName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return "ios"
  if (/Android/.test(ua)) return "android"
  return "other"
}
