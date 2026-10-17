"use client"

import { useEffect } from "react"

const TEXT_INPUTS = new Set(["text", "search", "email", "number", "tel", "url", "password", "date"])

function editable(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

/**
 * NAV_SPEC 1: hide the floating bars while the on-screen keyboard is open.
 * Phones open the keyboard when a text field takes focus, so on touch
 * screens that is the signal; the html element carries data-keyboard.
 */
export function KeyboardWatcher() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return
    const root = document.documentElement
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      if (editable(document.activeElement)) root.dataset.keyboard = "open"
      else delete root.dataset.keyboard
    }
    document.addEventListener("focusin", update)
    // Closing waits a moment: the keyboard is still animating away, and the
    // bars must not jump under a tap that is landing.
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(update, 250)
    }
    document.addEventListener("focusout", later)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", later)
      delete root.dataset.keyboard
    }
  }, [])
  return null
}
