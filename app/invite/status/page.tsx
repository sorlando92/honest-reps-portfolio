import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { looksLikeInviteToken } from "@/core/invites/token"
import { SignOutToAccept } from "./sign-out-to-accept"

export const metadata: Metadata = { title: "Invite" }

// Copy: PM 2026-10-18 (Q69).
const MESSAGES = {
  expired: "This invite expired. Ask your coach for a new one.",
  used: "This invite was already used.",
  other: "This invite was sent to another account. Sign out to accept it.",
} as const

export default function InviteStatusPage({ searchParams }: PageProps<"/invite/status">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col justify-center gap-4 px-4">
      <Suspense fallback={null}>
        <Status searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Status({ searchParams }: { searchParams: PageProps<"/invite/status">["searchParams"] }) {
  const { s, t } = await searchParams
  const kind = s === "used" || s === "other" ? s : "expired"
  const token = typeof t === "string" && looksLikeInviteToken(t) ? t : null
  return (
    <>
      <h1 className="text-title">Invite</h1>
      <p role="status" className="text-body">
        {MESSAGES[kind]}
      </p>
      {kind === "other" && token ? (
        <SignOutToAccept token={token} />
      ) : (
        <Link href="/today" className="inline-flex min-h-11 items-center text-body text-accent-strong underline">
          Go to the app
        </Link>
      )}
    </>
  )
}
