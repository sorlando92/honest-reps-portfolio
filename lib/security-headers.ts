// Response headers for every route (security audit M2, 2026-10-20). The
// full Content Security Policy is report-only until its reports are clean;
// framing is refused for real through frame-ancestors (which report-only
// ignores) and X-Frame-Options.

export interface HeaderEnv {
  supabaseUrl?: string
  sentryDsn?: string
  dev?: boolean
}

/** Sentry's CSP report endpoint for a DSN (https://KEY@HOST/PROJECT), or null. */
export function sentryReportUri(dsn: string | undefined): string | null {
  if (!dsn) return null
  try {
    const url = new URL(dsn)
    const project = url.pathname.replace(/^\/+/, "")
    if (!url.username || !project) return null
    return `${url.protocol}//${url.host}/api/${project}/security/?sentry_key=${url.username}`
  } catch {
    return null
  }
}

function origin(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** The report-only policy: what the app loads today, so violations point at something new. */
export function contentSecurityPolicy(env: HeaderEnv): string {
  const supabase = origin(env.supabaseUrl)
  const sentry = origin(env.sentryDsn)
  const report = sentryReportUri(env.sentryDsn)
  const list = (...items: (string | null | false | undefined)[]) => items.filter(Boolean).join(" ")
  return [
    "default-src 'self'",
    // Next inlines its bootstrap scripts; the barcode reader is WebAssembly.
    `script-src ${list("'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", env.dev && "'unsafe-eval'")}`,
    "style-src 'self' 'unsafe-inline'",
    // Signed check-in photos come from Supabase Storage; product photos from Open Food Facts.
    `img-src ${list("'self'", "data:", "blob:", supabase, "https://*.openfoodfacts.org")}`,
    "font-src 'self' data:",
    `connect-src ${list("'self'", supabase, supabase?.replace(/^http/, "ws"), sentry)}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    report && `report-uri ${report}`,
  ]
    .filter(Boolean)
    .join("; ")
}

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(env) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The barcode and label scanners use the camera; nothing else is needed.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  ]
}
