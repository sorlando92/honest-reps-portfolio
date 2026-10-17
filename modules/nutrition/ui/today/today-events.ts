"use client"

// Window events the journal's parts listen to, so the "+" sheet and the
// header menu can open things that live elsewhere on Today (NAV_SPEC 2, 4).

/** Opens the log flow on food search or the barcode scanner. */
export const LOG_OPEN_EVENT = "hr:log-open"
export type LogOpen = "search" | "scan"

/** Opens the weight sheet for the selected day. */
export const WEIGHT_OPEN_EVENT = "hr:weight-open"

/** Scrolls to the day note and focuses it. */
export const NOTE_FOCUS_EVENT = "hr:note-focus"

export function openLog(mode: LogOpen) {
  window.dispatchEvent(new CustomEvent<LogOpen>(LOG_OPEN_EVENT, { detail: mode }))
}

export function openWeight() {
  window.dispatchEvent(new Event(WEIGHT_OPEN_EVENT))
}

export function focusNote() {
  window.dispatchEvent(new Event(NOTE_FOCUS_EVENT))
}
