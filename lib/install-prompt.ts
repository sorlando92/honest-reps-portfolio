"use client"

// Android Chrome fires beforeinstallprompt once, early, before the install
// screen exists. PwaRuntime keeps it here so that screen can show the native
// install dialog from its own button (PRD F1 install step).

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function keepInstallPrompt(event: Event): void {
  event.preventDefault()
  deferred = event as BeforeInstallPromptEvent
  listeners.forEach((l) => l())
}

export function installPromptReady(): boolean {
  return deferred !== null
}

export function onInstallPromptChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shows the browser's install dialog; true when the user installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  listeners.forEach((l) => l())
  await event.prompt()
  return (await event.userChoice).outcome === "accepted"
}

// Q62: the install screen after onboarding can be dismissed once. If the app
// is still not installed 3 days later, Today shows one dismissible banner;
// after that, never prompt again. Install and reminders stay in Me. Kept per
// device, since installing is per device.
const DISMISSED_AT = "hr:install-dismissed-at"
const BANNER_DONE = "hr:install-banner-done"
/** Before Q62 was decided: a count of install screen dismissals. */
const LEGACY_DISMISSALS = "hr:install-dismissals"
export const INSTALL_BANNER_AFTER_DAYS = 3
const DAY_MS = 86_400_000

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: at worst the banner shows again, which is harmless.
  }
}

/** Records the first "Not now" on the install screen. */
export function dismissInstall(now: number = Date.now()): void {
  if (!read(DISMISSED_AT)) write(DISMISSED_AT, String(now))
}

/** True when Today should show the install banner (not installed is checked by the caller). */
export function installBannerDue(now: number = Date.now()): boolean {
  const legacy = Number(read(LEGACY_DISMISSALS) ?? 0) || 0
  if (legacy >= 2) write(BANNER_DONE, "1")
  else if (legacy === 1 && !read(DISMISSED_AT)) write(DISMISSED_AT, String(now))
  if (legacy > 0) {
    try {
      localStorage.removeItem(LEGACY_DISMISSALS)
    } catch {}
  }
  const at = Number(read(DISMISSED_AT))
  return at > 0 && !read(BANNER_DONE) && now - at >= INSTALL_BANNER_AFTER_DAYS * DAY_MS
}

/** The banner was dismissed or acted on: never prompt again. */
export function finishInstallBanner(): void {
  write(BANNER_DONE, "1")
}
