"use client"

import type { DraftItem } from "../parsing/service"

// PRD F2 "Draft": an unconfirmed card lives only on the device and reopens
// with the app. It never reaches food_entries until the user taps Log it.
const KEY = "hr:log-draft"
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface StoredDraft {
  text: string
  /** How the card started; a parsed card stays "text" when items are added. */
  method?: "text" | "search" | "manual" | "barcode"
  aiCallId: string | null
  items: DraftItem[]
  /** Stable across retries, so a save sent twice is stored once. */
  clientUuid: string
  createdAt: number
}

const CHANGED = "hr:draft-changed"

// Used when storage is blocked (some private modes): the card still works
// for this visit, it just will not survive closing the app.
let memory: string | null = null
let storageWorks = true

/** For useSyncExternalStore: notified when the draft changes in this tab or another. */
export function subscribeDraft(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/** The stored draft as a string, so React can compare snapshots by value. */
export function draftSnapshot(): string | null {
  if (!storageWorks) return memory
  try {
    return localStorage.getItem(KEY)
  } catch {
    storageWorks = false
    return memory
  }
}

export function parseDraft(raw: string | null): StoredDraft | null {
  try {
    if (!raw) return null
    const draft = JSON.parse(raw) as StoredDraft
    if (!draft.items?.length || Date.now() - draft.createdAt > MAX_AGE_MS) return null
    return draft
  } catch {
    return null
  }
}

export function saveDraft(draft: StoredDraft): void {
  memory = JSON.stringify(draft)
  try {
    localStorage.setItem(KEY, memory)
  } catch {
    storageWorks = false
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function clearDraft(): void {
  memory = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    storageWorks = false
  }
  window.dispatchEvent(new Event(CHANGED))
}
