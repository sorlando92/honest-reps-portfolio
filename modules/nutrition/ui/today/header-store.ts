"use client"

// Whether the macro card has scrolled under the header band, so the band can
// swap its week strip for the compact macro row (NAV_SPEC 4).

let away = false
const listeners = new Set<() => void>()

export function setMacroCardAway(next: boolean) {
  if (next === away) return
  away = next
  listeners.forEach((l) => l())
}

export function macroCardAway(): boolean {
  return away
}

export function subscribeMacroCard(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
