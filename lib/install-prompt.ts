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

const DISMISSALS = "hr:install-dismissals"
const SEEN_THIS_SESSION = "hr:install-seen"

/** Q62: how many times this device has dismissed the install screen. */
export function installDismissals(): number {
  try {
    return Number(localStorage.getItem(DISMISSALS) ?? 0) || 0
  } catch {
    return 0
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISSALS, String(installDismissals() + 1))
  } catch {
    // Storage blocked: the screen may show again, which is harmless.
  }
}

export function markInstallSeen(): void {
  try {
    sessionStorage.setItem(SEEN_THIS_SESSION, "1")
  } catch {}
}

export function installSeenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_THIS_SESSION) === "1"
  } catch {
    return true
  }
}
