import type { Metadata } from "next"

export const metadata: Metadata = { title: "Offline" }

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-2 px-4">
      <h1 className="text-title">You are offline</h1>
      <p className="text-body text-text-muted">This screen needs a connection. It will load when you are back online.</p>
    </main>
  )
}
