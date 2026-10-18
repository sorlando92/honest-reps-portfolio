import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs"

// Error monitoring (MILESTONES step 6, pulled forward 2026-10-18): payloads
// carry the user id only. No email, food, weight, health or note data, so
// request bodies, headers, cookies, query strings, console output and UI
// breadcrumbs never leave the device or server.

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/gi
// Postgres echoes row values: "Key (gtin)=(00815863022027)", "Failing row contains (...)".
const PG_VALUES = /(\)=\()[^)]*(\))|(Failing row contains \().*?(\))/g

export function scrubText(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PG_VALUES, (_m, a, b, c, d) => `${a ?? c}[redacted]${b ?? d}`)
}

/** Drops the query string and fragment: `?q=` holds what the user typed and `?date=` their day. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut < 0 ? url : url.slice(0, cut)
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? stripQuery(event.request.url) : undefined,
    }
  }
  delete event.extra
  if (event.contexts) {
    // Keep runtime, os, browser, device and trace; drop anything app supplied.
    const { runtime, os, browser, device, trace, app, cloud_resource, culture } = event.contexts
    event.contexts = { runtime, os, browser, device, trace, app, cloud_resource, culture }
  }
  if (event.message) event.message = scrubText(event.message)
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value)
    for (const frame of ex.stacktrace?.frames ?? []) delete frame.vars
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null)
  }
  return event
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const category = crumb.category ?? ""
  // Console lines and clicked or typed elements can carry food names and numbers.
  if (category === "console" || category.startsWith("ui.")) return null
  const data = crumb.data ? { ...crumb.data } : undefined
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = stripQuery(data[key])
    }
    for (const key of Object.keys(data)) {
      if (!["url", "from", "to", "method", "status_code"].includes(key)) delete data[key]
    }
  }
  return {
    ...crumb,
    message: crumb.message ? scrubText(stripQuery(crumb.message)) : undefined,
    data,
  }
}
