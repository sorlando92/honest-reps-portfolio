"use client"

import type { EventName, EventProps } from "./names"

/**
 * Client side track(). Fire and forget: analytics must never block or break
 * the action that triggered it. keepalive lets it finish during navigation.
 */
export function track(name: EventName, props: EventProps = {}): void {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Ignore: tracking is best effort.
  }
}
