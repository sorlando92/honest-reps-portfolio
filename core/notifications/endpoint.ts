// Push subscriptions must point at a browser push service (security audit M3,
// 2026-10-20): the server later POSTs to the endpoint with our VAPID key, so
// an arbitrary URL would turn reminders into requests to any host.

const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Android, Samsung Internet, Opera, Brave
  "push.apple.com", // Safari and installed iPhone apps (web.push.apple.com)
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "notify.windows.com", // Edge (wns2-*.notify.windows.com)
]

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}
